const _               = require('lodash');
const {Sockets}       = require('./helper/sockets');
const _TableInstance  = require('./controller/_table');
// const Table           = require('./../api/models/table');
// const {User}          = require('./../api/models/user');
const localization    = require('./../api/service/localization');
const Socketz         = new Sockets();
const requestTemplate = require('../api/service/request-template');
const config = require('../config');
// const ObjectId = require('mongoose').Types.ObjectId;
const { _Tables } = require('./utils/_tables');
const _tab = new _Tables();
const logDNA = require('../api/service/logDNA');
const redisCache = require('../api/service/redis-cache');
const { CostExplorer } = require('aws-sdk');
const e = require('express');
module.exports = function (io, bullQueue) {

    // If the Promise is rejected this will catch it.
    process.on('unhandledRejection', error => {
        GlobalError(error);
    });
    // Global Uncaught Exception.
    process.on('uncaughtException', error => {
        GlobalError(error);
    });
    //The function used to log unhandle exception.
    function GlobalError(error) {
        // for logDNA 
        logDNA.log('Global error', {
            level: 'error',
            meta: {'message': error.message, 'stack' : error.stack}
        });
    }

    bullQueue.process(async (job) => {
       // console.log("EVENT  ===>", job.data.name);
        return processBullEvent(job);
    });

    bullQueue.on('completed', (job, result) => {
        //console.log(`Job completed with result`, job.data);
        job.remove();
    });

    bullQueue.on('failed', (job, result) => {
       // console.log(`Job failed with result ${job.data}`);
        job.remove();
    });

    /**
     * The Socket connection start here
     */
    io.on('connection', function (socket) {
        // const sqsService      = require('../api/operations/sqs_fifo_services');
        // for logDNA 
        let logData = {
            level: 'debugg',
            meta: { 'socketId': socket.id }
        };
        logDNA.log('DEVICE :: connected', logData);
        // reset the socket connection for all listeners
        socket.removeAllListeners();

        /**
         * This event get room details
         * @param {object} contains room id.
         * 
         * @return array of object. 
         */
        socket.on('fetchGameData', async function (params, callback) {
            // console.log('fetchGameData - ', params);
            try {
                const startTime = Date.now();
                let myRoom = await redisCache.getRecordsByKeyRedis(params.room);
                let getDiceValue = await _TableInstance.getMyRoomData(myRoom);
                if(myRoom) {
                    let compressedUsersRes = myRoom.users.map((element) => {
                        return {
                            "name" : element.name,
                            "id" : element.id,
                            "profile_pic" : element.profile_pic,
                            "position" : element.position,
                            "is_active" : element.is_active,
                            "is_done" : element.is_done,
                            "is_left" : element.is_left,
                            "rank" : element.rank,
                            "tokens" : element.tokens,
                            "life" : element.life,
                            "token_colour" : element.token_colour,
                        };
                    });
                    let myRoomCompressed = {
                        "room" : myRoom.room,
                        "totalWinning": myRoom.totalWinning,
                        "players_done": parseInt(myRoom.no_of_players),
                        "players_won": myRoom.players_won,
                        "current_turn": myRoom.current_turn,
                        "current_turn_type": myRoom.current_turn_type,
                        "no_of_players": parseInt(myRoom.no_of_players),
                        "payoutConfig" : myRoom.payoutConfig,
                        "users" : compressedUsersRes,
                        "entryFee": myRoom.entryFee,
                        "turn_time": myRoom.turn_time,
                        "timeToCompleteGame": myRoom.timeToCompleteGame,
                        "server_time": new Date(),
                        "turn_timestamp": myRoom.turn_timestamp,
                        "skip_dice" : getDiceValue.skip_dice,
                        "dice" : getDiceValue.dice
                    }
                    const endTime = (Date.now() - startTime);
                    let logData = {
                        level: 'warning',
                        meta: { p: 'fetchGameData',responseTime: endTime,'env' : `${process.env.NODE_ENV}`, 'params' : params}
                    };
                    logDNA.warn(`fetchGameData`, logData);
                    return callback(myRoomCompressed);
                } else {
                    return callback();
                }
            }
            catch (err) {
                let logData = {
                    level: 'error',
                    meta: { 'env' : `${process.env.NODE_ENV}`,'error': err, 'params': params, stackTrace : err.stack}
                };
                logDNA.error('fetchGameData', logData);
            }
        });

        /**
         * ping event used for pinging up the connection.
         * 
         * @param params contains user token.
         * @output return params data as output.
         */
        socket.on('ping', function (params, callback) {
            const startTime = Date.now();
            const endTime = (Date.now() - startTime);
            let logData = {
                level: 'warning',
                meta: { p: 'ping',responseTime: endTime,'env' : `${process.env.NODE_ENV}`, 'params' : params}
            };
            logDNA.warn(`ping`,logData);
            return callback(params);
            
        });
        // New connection to Socket with Auth
        socket.on('join', async (params, callback) =>
        {
            //console.log('join - ', params);
            // Start the timer
            const startTime = Date.now();
            let responseObj = {};
            const start = Date.now();

            // for logDNA 
            let logData = {
                level: 'debugg',
                meta: { 'socketId': socket.id, 'params': params }
            };
            logDNA.log('Socket join fired', logData);
            await redisCache.addToRedis(socket.id, params.token);
            try {
                if (!params.token) {
                    return callback({
                        status: 0,
                        message: 'No Token provided',
                    });
                }
                let playerExists = await redisCache.getRecordsByKeyRedis(socket.id);
                if(playerExists) {
                    //Check if user already playing
                    var rez = await _TableInstance.reconnectIfPlaying(playerExists);
                    responseObj = {
                        status: 1,
                        // message: 'Socket registered successfully',
                        // server_time: new Date().getTime().toString(),
                        joined : rez.status,
                    };
                    return callback(responseObj);
                } else {
                    responseObj = {
                        status: 1,
                        // message: 'Socket registered successfully',
                        // server_time: new Date().getTime().toString(),
                        joined: 0
                    };
                    return callback(responseObj);
                }
            } catch (err)
            {
                // console.log("join",err);   
                // for logDNA 
                let logData = {
                    level: 'error',
                    meta: {'env' : `${process.env.NODE_ENV}`, 'error': err, 'params': params,stackTrace : err.stack }
                };
                logDNA.error('JOIN :: Event :: Error', logData);

                if (typeof callback == 'function')
                    return callback({
                        status: 0,
                        message: 'An error was encountered. Please join a new game.',
                    });

                // console.log("join", err);
                return callback();
            } finally {
                const endTime = (Date.now() - start);
                let logData = {
                    level: 'warning',
                    meta: { p: 'join',responseTime: endTime,'env' : `${process.env.NODE_ENV}`, 'params' : params}
                };
                logDNA.warn(`join`, logData);
            }
        });

        socket.on('join_previous', async (params, callback) => {
            //console.log('join_previous start- ', params);
            const startTime = Date.now();
            // console.log('TS1 ::', 'join_previous', socket.id, JSON.stringify(params));
            var myId = await Socketz.getId(socket.id);
            //console.log('join_previous myId- ', myId);
            try {
                if (!myId) {
                    let myLog = {
                        level: 'warning',
                        meta: { p: 'join_previous', 'env' : `${process.env.NODE_ENV}`, 'socketId' : socket.id}
                    };
                    logDNA.warn(`user_id not found at join_previous`, myLog);

                    return callback({
                        status: 0,
                        message: 'An error was encountered. Please join a new game.',
                    });
                }
                var rez = await _TableInstance.reconnectIfPlaying(myId);
                if (rez.status == 0) {
                    return callback({
                        status: 2,
                        message: 'An error was encountered. Please join a new game.',
                    })
                }
                // If no room to join the game.
                rez.table.room ? socket.join(rez.table.room) : socket.join();
                // rez.server_time = new Date();
                // rez.table.server_time = new Date();
                // return callback(rez);
                let getDiceValue;
                if(rez.status == 1) {
                    let myRoom = await redisCache.getRecordsByKeyRedis(rez.table.room);
                    getDiceValue = await _TableInstance.getMyRoomData(myRoom);
                }
                

                let compressedMyRoom = rez.table.users.map((element) => {
                    return {
                        "name" : element.name,
                        "id" : element.id,
                        "profile_pic" : element.profile_pic,
                        "position" : element.position,
                        "is_active" : element.is_active,
                        "is_done" :  element.hasOwnProperty('is_done') ? element.is_done : false,
                        "is_left" : element.hasOwnProperty('is_left') ? element.is_left : false,
                        "rank" : element.rank,
                        "tokens" : element.tokens,
                        "life" : element.life,
                        "token_colour" : element.token_colour,
                    };
                });
                let compressedTable = {
                        "room": rez.table.room,
                        "totalWinning": rez.table.totalWinning,
                        "players_done": parseInt(rez.table.players_done),
                        "players_won": rez.table.players_won,
                        "current_turn": rez.table.current_turn,
                        "current_turn_type": rez.table.current_turn_type,
                        "no_of_players": parseInt(rez.table.no_of_players),
                        "users" : compressedMyRoom,
                        "entryFee": rez.table.entryFee,
                        "turn_time": rez.table.turn_time,
                        "timeToCompleteGame": rez.table.timeToCompleteGame,
                        "server_time" : new Date(),
                        "turn_timestamp" : rez.table.turn_timestamp,
                        "skip_dice" : getDiceValue.skip_dice,
                        "dice" : getDiceValue.dice
                    }            
                    
                let compressedObj = {
                    "status": rez.status,
                    "table" : compressedTable,
                    "current_turn_type": rez.current_turn_type,
                    "dices_rolled": rez.dices_rolled,
                }
                // console.log('join_previous end- ', JSON.stringify(rez));
               return callback(compressedObj); 

            } catch (ex) {
                // console.log("join_previous", ex);
                let logData = {
                    level: 'error',
                    meta: { 'env' : `${process.env.NODE_ENV}`,'error': ex, 'params': params, stackTrace : ex.stack}
                };
                logDNA.error('join_previous :: Event :: Error', logData);
                return callback({
                    status: 0,
                    message: 'An error was encountered. Please join a new game.',
                });
            } finally {          
                const endTime = (Date.now() - startTime);
                let logData = {
                    level: 'warning',
                    meta: { p: 'join_previous',responseTime: endTime,'env' : `${process.env.NODE_ENV}`, 'params' : params, 'myId' : myId}
                };
                logDNA.warn(`join_previous`, logData);
            }
        });

        socket.on('go_in_background', async () => {
            // for logDNA 
            let logData = {
                level: 'debugg',
                meta: { 'socketId': socket.id }
            };
            logDNA.log('user_go_in_background', logData);
            socket.leaveAll();
            
        });

        socket.on('joinTournament', async (data, callback) =>
        {
            console.log('joinTournament - ', data);
            // Start the timer
            const startTime = Date.now();
            try{
            if (!data || !data.token)
            {
                return callback({
                    status: 0,
                    message: localization.missingTokenError,
                });
            }
            let verifyUser = await requestTemplate.post(`verifyuser`, {token: data.token});
            if (!verifyUser.isSuccess)
            {
                return callback({
                    status: 0,
                    message: verifyUser.error || localization.apiError,
                });
            }
            let params = verifyUser.data;
            params.room_fee = verifyUser.amount.toString();
            params.no_of_players = verifyUser.participants.toString();
            let payout = await calculateWinAmount(verifyUser.amount, verifyUser.payoutConfig);
            // console.log("payout -- ", payout);
            params.winningAmount = payout.payoutConfig;
            params.totalWinning = verifyUser.amount;//payout.totalWinning;
            params.lobbyId = verifyUser.lobbyId;
            // object to array convert for payoutConfig           
            const payoutArray = [];
            for (const key in verifyUser.payoutConfig) {
                if (verifyUser.payoutConfig.hasOwnProperty(key)) {
                    const value = verifyUser.payoutConfig[key];
                    payoutArray.push(String(value));
                }
            }
            params.payoutConfig = payoutArray;
            params.entryFee = 0;
            if('entryFee' in verifyUser) { params.entryFee = verifyUser.entryFee };
            // to setup individual game time for room
            if('gameTime' in verifyUser) { params.gameTime = verifyUser.gameTime };
            // to setup turnTime for room
            if('turnTime' in verifyUser) { params.turnTime = verifyUser.turnTime };
            
            logData = {
                level: 'debugg',
                meta: payout
            };
            logDNA.log('Calculate win ammount',logData);
            // To delete object
            // deleteObjectProperty(payout);
            // console.log("params >>>>>", params);
            if (!params || !params.user_id)
            {
                return callback({
                    status: 0,
                    message: localization.missingParamError,
                });
            }
            var us = {
                'id' : params.user_id.toString(),
                'name': params.user_name,
                'numeric_id': params.user_id.toString(),
                'lobbyId': verifyUser.lobbyId,
                'profilepic': params.profile_pic,
                'token': params.token,
                'joinedAt' : new Date().getTime()
            };
            socket.data_id = params.user_id.toString();
            socket.data_name = params.user_name;
            socket.join(socket.data_id);
            await Socketz.updateSocket(params.user_id, socket);

            await redisCache.addToRedis(data.token, params.user_id.toString());
            var myId = await Socketz.getId(socket.id);
            if (!myId)
            {
                return callback({
                    status: 0,
                    message: 'An error was encountered. Please join a new game.',
                });
            }
            var rez = await _TableInstance.joinTournamentV2(params, params.entryFee, myId, us,0);
            if(rez.callback.status == 1) {
                let compressedMyRoom = rez.callback.table.users.map((element) => {
                    return {
                        "name" : element.name,
                        "id" : element.id,
                        "profile_pic" : element.profile_pic,
                        "position" : element.position,
                        "is_active" : element.is_active,
                        "is_done" :  element.hasOwnProperty('is_done') ? element.is_done : false,
                        "is_left" : element.hasOwnProperty('is_left') ? element.is_left : false,
                        "rank" : element.rank,
                        "tokens" : element.tokens,
                        "life" : element.life,
                        "token_colour" : element.token_colour,
                    };
                });
                let compressedTable = {
                        "room": rez.callback.table.room,
                        "totalWinning": rez.callback.table.totalWinning,
                        "players_done": parseInt(rez.callback.table.players_done),
                        "players_won": rez.callback.table.players_won,
                        "current_turn": rez.callback.table.current_turn,
                        "current_turn_type": rez.callback.table.current_turn_type,
                        "no_of_players": rez.callback.table.no_of_players,
                        "users" : compressedMyRoom,
                        "entryFee": rez.callback.table.entryFee,
                        "turn_time": rez.callback.table.turn_time,
                        "timeToCompleteGame": rez.callback.table.timeToCompleteGame,
                        "server_time" : new Date(),
                        "turn_timestamp" : new Date(),
                    }            

                let compressedObj = {
                    "status": rez.callback.status,
                    "table" : compressedTable,
                    "position": rez.callback.position,
                    "timerStart": rez.callback.timerStart,
                    "default_diceroll_timer": rez.callback.default_diceroll_timer,
                }
                callback(compressedObj);
            } else {
                callback(rez.callback);
            }
            if (rez.callback.status == 1)
            {  
                let myRoom=rez.myRoom;
                let gamePlayData = await redisCache.getRecordsByKeyRedis('gamePlay_'+myRoom.room);
                await redisCache.addToRedis(myRoom.room,myRoom);
                await redisCache.addToRedis('gamePlay_'+myRoom.room ,gamePlayData);
                // console.log('GAME-PLAY-DATA-1', JSON.stringify(gamePlayData));
                socket.join(rez.callback.table.room);
                processEvents(rez,myRoom, socket);
                var params_data = {
                    room: rez.callback.table.room,
                }
                    var start = await _TableInstance.startIfPossibleTournament(params_data, myRoom, gamePlayData);
                    // console.log("Start", start);
                    if (start) {
                        let reqData = await _TableInstance.getGameUsersData(start);
                        let startGame = await requestTemplate.post(`startgame`, reqData)

                        if (!startGame.isSuccess) {
                            let i = 0;
                            leaveUser(i, start);
                            async function leaveUser(i, start) {
                                if (i < 4) {
                                    // console.log("start game error > ", start.table)
                                    if (start.table.users[i] && start.table.users[i].id) {
                                        let data = {
                                            room: params_data.room,
                                            isRefund: true
                                        }
                                        var resp = await _TableInstance.leaveTable(data, start.table.users[i].id, socket, myRoom, gamePlayData);
                                        processEvents(resp, myRoom, socket);
                                        i++;
                                        leaveUser(i, start);
                                        // To remove a particular socket ID from a room
                                        let socketIdToRemove = socket.id;                                        
                                        if(io.sockets.sockets[socketIdToRemove]) {
                                            io.sockets.sockets[socketIdToRemove].leave(myRoom.room);
                                        }
                                    }
                                }
                            }
                            return callback({
                                status: 0,
                                message: startGame.error,
                            });
                        }
                        // if tournament possible
                        await startTournament(start, socket, myRoom, gamePlayData);
                        await bullQueue.add(
                            { name: "gameCompletionQueue", payload: { start, myRoom } },
                            {
                                delay: 500
                            }
                        );
                        await redisCache.addToRedis(myRoom.room, myRoom);
                        await redisCache.addToRedis('gamePlay_' + myRoom.room, gamePlayData);
                        //  console.log('GAME-PLAY-DATA-2', JSON.stringify(gamePlayData));
                    }
                    else {
                        await Socketz.sleep(40000);
                        myRoom = await redisCache.getRecordsByKeyRedis(myRoom.room);
                        gamePlayData = await redisCache.getRecordsByKeyRedis('gamePlay_' + myRoom.room);
                        let tableD = await redisCache.getRecordsByKeyRedis(`table_${params_data.room}`);
                        if (tableD && tableD.players.length < tableD.no_of_players) {
                            for (let i = 0; i < 4; i++) {
                                if (tableD.players[i] && tableD.players[i].id) {
                                    let data = {
                                        room: tableD.room,
                                        gameNotStarted: 'true',
                                        isRefund: true
                                    }
                                    let rez = await _TableInstance.leaveTable(data, tableD.players[i].id, socket, myRoom, gamePlayData);
                                    // console.log("rez--", rez);
                                    processEvents(rez, myRoom, socket);
                                }
                            }
                        }
                    }
                }
            }           
            catch (ex) {
                // console.log("joinTournament ", ex);
                let logData = {
                    level: 'error',
                    meta: { 'env' : `${process.env.NODE_ENV}`,'error': ex, 'params': data, stackTrace : ex.stack}
                };
                logDNA.error('joinTournament :: Event :: Error', logData);
                return callback();
            } finally {
                const endTime = (Date.now() - startTime);
                let logData = {
                    level: 'warning',
                    meta: { p: 'joinTournament',responseTime: endTime,'env' : `${process.env.NODE_ENV}`}
                };
                logDNA.warn(`joinTournament`,logData);
            }
        });

        // Leave Table / Quit Game
        socket.on('leaveTable', async (params, callback) => {
            //console.log('leaveTable - ', params);
            const startTime = Date.now();
            let tableD = await redisCache.getRecordsByKeyRedis(`table_${params.room}`);
            if (tableD != null && tableD.isGameCompleted) {
                return callback({ 'isGameCompleted': true, 'room': params.room });
            }

            try {
                if(!params.room)
                {
                    let myId = await Socketz.getId(socket.id);
                    let roomId = await redisCache.getRecordsByKeyRedis('user_id'+myId.toString());
                    if(roomId)
                        params.room=roomId;
                }
               if(!params.room)
                   return callback();
                   
                // console.log('TS1 ::', 'leaveTable', socket.id, JSON.stringify(params));
                let myId = await Socketz.getId(socket.id);
                await Socketz.userGone(socket.id, params.token);
                params.isRefund = false;
                myRoom = await redisCache.getRecordsByKeyRedis(params.room);
                gamePlayData = await redisCache.getRecordsByKeyRedis('gamePlay_' + params.room);
                let response = await _TableInstance.leaveTable(params, myId, socket, myRoom, gamePlayData);
                await redisCache.addToRedis(myRoom.room, myRoom);
                const userData = [];
                if(myRoom.users) {
                    myRoom.users.map((cur) => {
                        userData.push({
                            "player_index": cur.position,
                            "id": cur.id,
                            "name": cur.name,
                            "rank": 0,
                            "amount": 0,
                            "is_left": cur.hasOwnProperty('is_left') ? cur.is_left : false,
                            "score": 0
                        });
                    }, []);
                }
                // Here we need to check if there is only one player left in the game 
                // then update the game_data response

                const activePlayerLeft = userData.filter(item => item.is_left === true).length;
                if (activePlayerLeft <= 1) {
                    // Update the userData
                    var endGameRes = await _tab.calculateGameEndData(params.room, myRoom.win_amount, myRoom);
                    for(let i = 0; i< endGameRes.rank.length;i++){
                        userData[i] = endGameRes.rank[i];
                    }
                }
                response.callback.room = myRoom.room;
                response.callback.game_data = userData;
                callback(response.callback);
                // To remove a particular socket ID from a room
                let socketIdToRemove = socket.id;
                if(io.sockets.sockets[socketIdToRemove]){
                io.sockets.sockets[socketIdToRemove].leave(myRoom.room);
                }
                if (response.callback && response.callback.status == 1) processEvents(response, myRoom, socket);
            }
            catch (ex) {
                //console.log("leaveTable", ex);
                let logData = {
                    level: 'error',
                    meta: { 'env' : `${process.env.NODE_ENV}`,'error': ex, 'params': params, stackTrace : ex.stack, "gamePlayData": gamePlayData,"myRoom":myRoom}
                };
                logDNA.error('leaveTable :: Event :: Error', logData);              
                return callback();
            } finally {
                const endTime = (Date.now() - startTime);
                let logData = {
                    level: 'warning',
                    meta: { p: 'leaveTable',responseTime: endTime,'env' : `${process.env.NODE_ENV}`}
                };
                logDNA.warn(`leaveTable`,logData);
            }

        });

        socket.on('tournamnt_dice_rolled', async (params, callback) => {
            const startTime = Date.now();
            try {
                //console.log("TS1 ::", 'tournamnt_dice_rolled', socket.id, JSON.stringify(params), new Date());
                // console.log(socket.data_name, " Rolled ", params.dice_value);
                let myId = await Socketz.getId(socket.id);
                // redis call by room.
                let myRoom = await redisCache.getRecordsByKeyRedis(params.room);
                let gamePlayData = await redisCache.getRecordsByKeyRedis('gamePlay_' + params.room);
                let response = await _TableInstance.tournamntDiceRolled(socket, params, myId, myRoom, gamePlayData);
                //console.log('tournamnt_dice_rolled callback', params, response.callback);
                await redisCache.addToRedis(myRoom.room, myRoom);
                await redisCache.addToRedis('gamePlay_' + myRoom.room, gamePlayData);
                // console.log('GAME-PLAY-DATA-3', JSON.stringify(gamePlayData));
                let turnTimer = config.turnTimer;
                let tableData = await redisCache.getRecordsByKeyRedis(`table_${myRoom.room}`);
                if(tableData && 'turnTime' in tableData) { turnTimer = tableData.turnTime; }
                turnTimer += 2;
                turnTimer = turnTimer * 1000;

                if(response && response.events)
                {
                    for (const d of response.events)
                    {
                        if(d.name == 'make_diceroll' && response.callback.skip_dice == true)
                        {
                            await bullQueue.add(
                                {
                                    name: "playerTurnQueue",
                                    payload: { room: params.room },
                                },
                                {
                                    delay: turnTimer
                                }
                            );
                            break;
                        }
                    }
                }
                callback(response.callback);
                if (response.callback.status == 1) processEvents(response, myRoom, socket);
            }
            catch (error) {
                // console.log('dice_roll_error', error);
               // logDNA.log('dice_roll_error', { level: 'error', meta: { 'error': error } });
                let logData = {
                    level: 'error',
                    meta: { 'env' : `${process.env.NODE_ENV}`,'error': error, 'params': params, stackTrace : error.stack}
                };
                logDNA.error('tournamnt_dice_rolled :: Event :: Error', logData);
                return callback();
                
            } finally {
                const endTime = (Date.now() - startTime);
                let logData = {
                    level: 'warning',
                    meta: { p: 'tournamnt_dice_rolled',responseTime: endTime,'env' : `${process.env.NODE_ENV}`}
                };
                logDNA.warn(`tournamnt_dice_rolled`,logData);
            }
        });

        socket.on('tournament_move_made', async (params, callback) => {
            // console.log('tournament_move_made', params);
            const startTime = Date.now();
            let myId = await Socketz.getId(socket.id);
            let myRoom = await redisCache.getRecordsByKeyRedis(params.room);
            try {
                // console.log("Tournament_move_made ::", JSON.stringify(params));
                // console.log(socket.data_name, ' Moved token of tournament ', params.token_index, ' By ', params.dice_value, ' places');
                let gamePlayData = await redisCache.getRecordsByKeyRedis('gamePlay_' + params.room);
                let response = await _TableInstance.moveTourney(params, myId, gamePlayData, myRoom);
                // console.log('Tournament_move_made callback', response);
                await redisCache.addToRedis(myRoom.room, myRoom);
                await redisCache.addToRedis('gamePlay_' + myRoom.room, gamePlayData);
                // console.log('GAME-PLAY-DATA-4', JSON.stringify(gamePlayData));
                if(response)
                {
                    let timer =12000;

                    let turnTimer = config.turnTimer;
                    let tableData = await redisCache.getRecordsByKeyRedis(`table_${myRoom.room}`);
                    if('turnTime' in tableData) { turnTimer = tableData.turnTime; }
                    turnTimer += 2;

                    if(response.callback && response.callback.isKillable)
                        turnTimer += 2.5;
                    turnTimer = turnTimer * 1000;

                    await bullQueue.add(
                        {
                            name: "playerTurnQueue",
                            payload: { room: params.room },
                        },
                        {
                            delay: turnTimer
                        }
                    );
                callback(response.callback);
                if(response.events  && response.events.length>0)
                {
                    if (response.callback.status == 1) processEvents(response, myRoom, socket);
                    // to update current turn for player if player miss the events.
                    // if (response.events[1].data.position != null) {
                    //     process.env.CURRENT_TURN_POSITION = response.events[1].data.position;
                    // } else if (response.events[1].data.player_index != null) {
                    //     process.env.CURRENT_TURN_POSITION = response.events[1].data.player_index;
                    // }
                }
             }
            }
            catch (err) {
                console.error("tournament_move_made", err);
                let logData = {
                    level: 'error',
                    meta: { 'env' : `${process.env.NODE_ENV}`,'error': err, 'params': params, 'room' : myRoom, stackTrace : err.stack,'id':myId}
                };
                logDNA.error('tournament_move_made :: Event :: Error', logData);
                return callback();
            } finally {
                const endTime = (Date.now() - startTime);
                let logData = {
                    level: 'warning',
                    meta: { p: 'tournament_move_made',responseTime: endTime,'env' : `${process.env.NODE_ENV}`}
                };
                logDNA.warn(`tournament_move_made`, logData);
            }
        });
        //Skip Turn
        socket.on('skip_turn', async (params, callback) =>
        {
            // Start the timer
            const startTime = Date.now();
            let tableD = await redisCache.getRecordsByKeyRedis(`table_${params.room}`);
            if(tableD!= null && tableD.isGameCompleted) {
                return callback({'isGameCompleted': true, 'room': params.room});
            }

            try{
            // console.log('TS1 ::', 'skip_turn', socket.id, JSON.stringify(params));
            let myId = await Socketz.getId(socket.id);
            let myRoom = await redisCache.getRecordsByKeyRedis(params.room);
            let gamePlayData = await redisCache.getRecordsByKeyRedis('gamePlay_'+params.room);
            let response = await _TableInstance.skipTurn(params, myId, myRoom, gamePlayData);
            // console.log("SKIP TURN RES", response);
            myRoom = response.table;
            gamePlayData = response.gameData;
            await redisCache.addToRedis(myRoom.room,myRoom);
            await redisCache.addToRedis('gamePlay_'+myRoom.room ,gamePlayData);
            // console.log('GAME-PLAY-DATA-5', JSON.stringify(gamePlayData));
            callback(response.callback);
            processEvents(response, myRoom, socket);
            // To remove a particular socket ID from a room
            let socketIdToRemove = socket.id;
            if(io.sockets.sockets[socketIdToRemove]) {
                io.sockets.sockets[socketIdToRemove].leave(myRoom.room);
            }
            }
            catch (ex) {
                // console.log("skip_turn", ex);
                let logData = {
                    level: 'error',
                    meta: { 'env' : `${process.env.NODE_ENV}`,'error': ex, 'params': params, stackTrace : ex.stack}
                };
                logDNA.error('skip_turn :: Event :: Error', logData);
                return callback();
            } finally {
                const endTime = (Date.now() - startTime);
                let logData = {
                    level: 'warning',
                    meta: { p: 'skip_turn',responseTime: endTime,'env' : `${process.env.NODE_ENV}`}
                };
                logDNA.warn(`skip_turn`, logData);
            }
        });
        // This event for Socket Disconnect.
        socket.on('disconnect', async () => {
            logDNA.log('DEVICE :: Disconnected', logData);
            // To remove a particular socket ID from a room
            let socketIdToRemove = socket.id;
            let userId = await Socketz.getId(socketIdToRemove);
            if(userId) {
                let room  = await Socketz.getId('user_id'+userId);
                if(io.sockets.sockets[socketIdToRemove]){
                    io.sockets.sockets[socketIdToRemove].leave(room);
                }
            }
            // var myId = Socketz.getId(socket.id);
            //Socketz.userGone(socket.id);

            // To track disconnect events.
            // console.log(`${socket.id} disconnect`);
            // Trigger garbage collection
            // if (global.gc) {
            //     global.gc();
            // } else {
            //     console.warn('Garbage collection unavailable. Add --expose-gc when launching Node.js.');
            // }
            // removeListeners(socket);
            // findAndRemoveFromRoomBySocketId(socket);
        });

        /**
         * Below events are only for Ludo Tournament
         */
        socket.on('tournament_join', async (params, callback) => {
            try {
                // save player token into redis
                await redisCache.addToRedis(socket.id, params.token);             
                if (!params.token) {
                    return callback({
                        status: 0,
                        message: 'No Token provided',
                    });
                }
                return callback({
                    status: 1,
                    joined: 0
                });
            } catch (err)
            {
                // for logDNA 
                let logData = {
                    level: 'error',
                    meta: {'env' : `${process.env.NODE_ENV}`, 'error': err, 'params': params,stackTrace : err.stack }
                };
                logDNA.error('tournament_game_join', logData);
                if (typeof callback == 'function')
                    return callback({
                        status: 0,
                        message: 'An error was encountered. Please join a new game.',
                    });
                return callback();
            }                        
        });

        socket.on('tournament_verify', async (data, callback) => {
            const startTime = Date.now();
            try {
                if (!data || !data.token) {
                    return callback({
                        status: 0,
                        message: 'Token missing',
                    });
                }
                let verifyUser = await requestTemplate.post(`verifyuser`, {
                    token: data.token
                });
                if (!verifyUser.isSuccess) {
                    return callback({
                        status: 0,
                        message: verifyUser.error || localization.apiError,
                    });
                }
                let params = verifyUser.data;
                params.room_fee = verifyUser.amount.toString();
                params.no_of_players = verifyUser.participants.toString();
                params.payoutConfig = verifyUser.payoutConfig;
                params.totalWinning = verifyUser.amount;
                params.lobbyId = verifyUser.lobbyId;
                params.entryFee = 0;
                if ('entryFee' in verifyUser) {
                    params.entryFee = verifyUser.entryFee;
                };                                
                params.gameTime = verifyUser.gameTime;            
                params.turnTime = verifyUser.turnTime;            

                if (!params || !params.user_id) {
                    return callback({
                        status: 0,
                        message: localization.missingParamError,
                    });
                }
                socket.data_id = params.user_id.toString();
                socket.data_name = params.user_name;
                socket.join(socket.data_id);
                await Socketz.updateSocket(params.user_id, socket);
                await redisCache.addToRedis(data.token, params.user_id.toString());
                await redisCache.addToRedis('user_id'+params.user_id, params.lobbyId);
                var myId = await Socketz.getId(socket.id);
                if (!myId) {
                    return callback({
                        status: 0,
                        message: 'An error was encountered. Please join a new game.',
                    });
                }
                var myRoom = await _TableInstance.createTableforTournament(params);
                let compressedMyRoom = myRoom.users.map((element) => {
                    return {
                        "name": element.name,
                        "id": element.id,
                        "profile_pic": element.profile_pic,
                        "position": element.position,
                        "is_active": element.is_active,
                        "is_done": element.hasOwnProperty('is_done') ? element.is_done : false,
                        "is_left": element.hasOwnProperty('is_left') ? element.is_left : false,
                        "rank": element.rank,
                        "tokens": element.tokens,
                        "life": element.life,
                        "token_colour": element.token_colour,
                    };
                });
                let compressedTable = {
                    "room": myRoom.room,
                    "totalWinning": myRoom.totalWinning,
                    "players_done": parseInt(myRoom.players_done),
                    "players_won": myRoom.players_won,
                    "current_turn": myRoom.current_turn,
                    "current_turn_type": myRoom.current_turn_type,
                    "no_of_players": myRoom.no_of_players,
                    "users": compressedMyRoom,
                    "entryFee": myRoom.entryFee,
                    "turn_time": myRoom.turn_time,
                    "timeToCompleteGame": myRoom.timeToCompleteGame,
                    "server_time": new Date(),
                    "turn_timestamp": new Date(),
                }

                let compressedObj = {
                    "status": 1,
                    "table": compressedTable,
                    "position": 0,
                    "timerStart": myRoom.timerStart,
                    "default_diceroll_timer": myRoom.default_diceroll_timer,
                }
                callback(compressedObj);
                let gamePlayData = await redisCache.getRecordsByKeyRedis('gamePlay_' + myRoom.room);
                socket.join(myRoom.room);
                var params_data = {
                    room: myRoom.room,
                }
                var start = await _TableInstance.startIfPossibleTournament(params_data, myRoom, gamePlayData);
                // console.log("Start", start);
                if (start) {
                    let reqData = await _TableInstance.getGameUsersData(start);
                    await requestTemplate.post(`startgame`, reqData);
                    // if tournament possible
                    await startTournament(start, socket, myRoom, gamePlayData);
                    await bullQueue.add({
                        name: "gameCompletionQueue",
                        payload: {
                            start,
                            myRoom
                        }
                    }, {
                        delay: 500
                    });
                    await redisCache.addToRedis(myRoom.room, myRoom);
                    await redisCache.addToRedis('gamePlay_' + myRoom.room, gamePlayData);
                }
            } catch (error) {
                let logData = {
                    level: 'error',
                    meta: {
                        'env': `${process.env.NODE_ENV}`,
                        'error': error,
                        'params': data,
                        stackTrace: error.stack
                    }
                };
                logDNA.error('join_tournament_game', logData);
                return callback();
            } finally {
                const endTime = (Date.now() - startTime);
                let logData = {
                    level: 'warning',
                    meta: {
                        p: 'joinTournament',
                        responseTime: endTime,
                        'env': `${process.env.NODE_ENV}`
                    }
                };
                logDNA.warn(`join_tournament_game`, logData);
            }
        });

        socket.on('tournament_diceRoll', async (params, callback) => {
            const startTime = Date.now();
            try {
               
                let myId = await Socketz.getId(socket.id);
                // redis call by room.
                let myRoom = await redisCache.getRecordsByKeyRedis(params.room);
                let gamePlayData = await redisCache.getRecordsByKeyRedis('gamePlay_' + params.room);
                let response = await _TableInstance.tournamntGameDiceRolled(params, myId, myRoom, gamePlayData);
                await redisCache.addToRedis(myRoom.room, myRoom);
                await redisCache.addToRedis('gamePlay_' + myRoom.room, gamePlayData);
                let turnTimer = config.turnTimer;
                let tableData = await redisCache.getRecordsByKeyRedis(`table_${myRoom.room}`);
                if(tableData && 'turnTime' in tableData) { turnTimer = tableData.turnTime; }
                turnTimer += 2;
                turnTimer = turnTimer * 1000;

                if(response && response.events)
                {
                    for (const d of response.events)
                    {
                        if(d.name == 'make_diceroll' && response.callback.skip_dice == true)
                        {
                            await bullQueue.add(
                                {
                                    name: "playerTurnQueue",
                                    payload: { room: params.room },
                                },
                                {
                                    delay: turnTimer
                                }
                            );
                            break;
                        }
                    }
                }
                callback(response.callback);
                // if (response.callback.status == 1) processEvents(response, myRoom, socket);
                if (response.callback.status == 1) emitEventsforTournament(response, myRoom, socket);
            }
            catch (error) {
                let logData = {
                    level: 'error',
                    meta: { 'env' : `${process.env.NODE_ENV}`,'error': error, 'params': params, stackTrace : error.stack}
                };
                logDNA.error('tournamnt_game_dice_rolled', logData);
                return callback();
                
            } finally {
                const endTime = (Date.now() - startTime);
                let logData = {
                    level: 'warning',
                    meta: { p: 'tournamnt_dice_rolled',responseTime: endTime,'env' : `${process.env.NODE_ENV}`}
                };
                logDNA.warn(`tournamnt_game_dice_rolled`,logData);
            }
        });

        socket.on('tournament_moveMade', async (params, callback) => {
            // console.log('tournament_move_made', params);
            const startTime = Date.now();
            let myId = await Socketz.getId(socket.id);
            let myRoom = await redisCache.getRecordsByKeyRedis(params.room);
            try {
                let gamePlayData = await redisCache.getRecordsByKeyRedis('gamePlay_' + params.room);
                let response = await _TableInstance.tournamentMoveMade(params, myId, gamePlayData, myRoom);
                await redisCache.addToRedis(myRoom.room, myRoom);
                await redisCache.addToRedis('gamePlay_' + myRoom.room, gamePlayData);
                if(response)
                {
                    let turnTimer = config.turnTimer;
                    let tableData = await redisCache.getRecordsByKeyRedis(`table_${myRoom.room}`);
                    if('turnTime' in tableData) { turnTimer = tableData.turnTime; }
                    turnTimer += 2;
                    if(response.callback && response.callback.isKillable) { console.log('killable'); turnTimer += 10; }
                    turnTimer = turnTimer * 1000;
                    await bullQueue.add(
                        {
                            name: "playerTurnQueue",
                            payload: { room: params.room },
                        },
                        {
                            delay: turnTimer
                        }
                    );
                callback(response.callback);
                if(response.events  && response.events.length>0)
                {
                    // if (response.callback.status == 1) processEvents(response, myRoom, socket);
                    if (response.callback.status == 1) emitEventsforTournament(response, myRoom, socket);
                }
             }
            }
            catch (err) {
                let logData = {
                    level: 'error',
                    meta: { 'env' : `${process.env.NODE_ENV}`,'error': err, 'params': params, 'room' : myRoom, stackTrace : err.stack,'id':myId}
                };
                logDNA.error('tournament_game_move_made', logData);
                return callback();
            } finally {
                const endTime = (Date.now() - startTime);
                let logData = {
                    level: 'warning',
                    meta: { p: 'tournament_move_made',responseTime: endTime,'env' : `${process.env.NODE_ENV}`}
                };
                logDNA.warn(`tournament_game_move_made`, logData);
            }
        });

        socket.on('tournament_join_previous', async (params, callback) => {
        
            const startTime = Date.now();
            // save player token into redis
            await redisCache.addToRedis(socket.id, params.token);
            // To get user_id from token.                        
            const userId = await Socketz.getId(socket.id);
            try {

                if (!userId) {
                    let myLog = {
                        level: 'warning',
                        meta: {
                            p: 'join_previous',
                            'env': `${process.env.NODE_ENV}`,
                            'socketId': socket.id
                        }
                    };
                    logDNA.warn(`user_id not found at join_previous in TournamentGame`, myLog);

                    return callback({
                        status: 0,
                        message: 'An error was encountered. Please join a new game.',
                    });
                }
                // To get roomId from user_id
                const roomId = await redisCache.getRecordsByKeyRedis('user_id'+id.toString());
                if(!roomId) {
                    return callback({
                        status: 2,
                        message: 'Room not found, Please join a new game.',
                    })
                }
                // join socket to room
                socket.join(roomId);
                const myRoom = await redisCache.getRecordsByKeyRedis(rez.table.room);
                const compressedMyRoom = myRoom.users.map((element) => {
                    return {
                        "name": element.name,
                        "id": element.id,
                        "profile_pic": element.profile_pic,
                        "position": element.position,
                        "is_active": element.is_active,
                        "is_done": element.hasOwnProperty('is_done') ? element.is_done : false,
                        "is_left": element.hasOwnProperty('is_left') ? element.is_left : false,
                        "rank": element.rank,
                        "tokens": element.tokens,
                        "life": element.life,
                        "token_colour": element.token_colour,
                    };
                });
                // To finding the dice value for player by player_id.
                const player = myRoom.users.find(player => player.id == userId);
                const skip_dice = false;
                const compressedTable = {
                    "room": myRoom.room,
                    "totalWinning": myRoom.totalWinning,
                    "players_done": parseInt(myRoom.players_done),
                    "players_won": myRoom.players_won,
                    "current_turn": myRoom.current_turn,
                    "current_turn_type": myRoom.current_turn_type,
                    "no_of_players": parseInt(myRoom.no_of_players),
                    "users": compressedMyRoom,
                    "entryFee": myRoom.entryFee,
                    "turn_time": myRoom.turn_time,
                    "timeToCompleteGame": myRoom.timeToCompleteGame,
                    "server_time": new Date(),
                    "turn_timestamp": myRoom.turn_timestamp,
                    "skip_dice": skip_dice,
                    "dice": player.dices_rolled.toString()
                }
                const compressedObj = {
                    "status": 1,
                    "table": compressedTable,
                    "current_turn_type": myRoom.current_turn_type,
                    "dices_rolled": player.dices_rolled,
                }
               // To return the object.
                return callback(compressedObj);

            } catch (ex) {
                let logData = {
                    level: 'error',
                    meta: {
                        'env': `${process.env.NODE_ENV}`,
                        'error': ex,
                        'params': params,
                        stackTrace: ex.stack
                    }
                };
                logDNA.error('join_previous_tournament_game :: Event :: Error', logData);
                return callback({
                    status: 0,
                    message: 'An error was encountered. Please join a new game.',
                });
            } finally {
                const endTime = (Date.now() - startTime);
                let logData = {
                    level: 'warning',
                    meta: {
                        p: 'join_previous',
                        responseTime: endTime,
                        'env': `${process.env.NODE_ENV}`,
                        'params': params,
                        'myId': userId
                    }
                };
                logDNA.warn(`join_previous_tournament_game`, logData);
            }
        })

    });

    function removeListeners(socket) {
        // Remove the event listeners you previously added
        try {
            // const eventsList = ['fetchGameData','ping','join','join_previous','go_in_background','joinTournament','leaveTable','tournamnt_dice_rolled','tournament_move_made','skip_turn'];
            socket.removeAllListeners();
        } catch (error) {
            let logData = {
                level: 'error',
                meta: { 'env' : `${process.env.NODE_ENV}`,'error': error, 'params': params, stackTrace : error.stack}
            };
            logDNA.error('remove_listeners', logData);
        }
    }
    function findAndRemoveFromRoomBySocketId(socket){
        try 
        {
            const rooms = io.sockets.adapter.rooms;
            for (const key in rooms) {
                socket.leave(key);
            }
            // Clear the rooms object
            // io.sockets.adapter.rooms = {};
            // Clear the sids object
            // io.sockets.adapter.sids = {};
            socket = null;        
        } catch(error) {
            let logData = {
                level: 'error',
                meta: { 'env' : `${process.env.NODE_ENV}`,'error': error, 'params': params, stackTrace : error.stack}
            };
            logDNA.error('socket_room_remove', logData);
        }
    }

    async function startTournament(start, socket, myRoom, gamePlayData) {

        myRoom.turn_timestamp = new Date();
        if(start && start.table && start.table.users && start.table.users.length > 0) {        
            let tableData = {};
            tableData.room = start.table.room;
            tableData.current_turn_type = start.table.current_turn_type;
            tableData.totalWinning = start.table.totalWinning;
            tableData.no_of_players = start.table.no_of_players;
            tableData.payoutConfig = start.table.payoutConfig;
            tableData.entryFee = start.table.entryFee;
            tableData.current_turn = start.table.current_turn;
            tableData.players_done = parseInt(start.table.players_done);
            tableData.players_won = start.table.players_won;
            tableData.server_time = start.table.server_time;
            tableData.turn_timestamp = start.table.turn_timestamp;
            tableData.turn_time = start.table.turn_time;
            tableData.timeToCompleteGame = start.table.timeToCompleteGame;

            let usersData = [];
            start.table.users.map((ele) => {
                usersData.push({
                    'name' : ele.name,
                    'id' : ele.id,
                    'profile_pic' : ele.profile_pic,
                    'position' : ele.position,
                    'is_active' : ele.is_active,
                    'is_done' : ele.is_done,
                    'is_left' : ele.is_left,
                    'rank' : ele.rank,
                    'tokens' : ele.tokens,
                    'life' : ele.life,
                    'token_colour' : ele.token_colour,
                });
            })
            start.skip_dice = false;
            start.table = tableData;
            start.table.users = usersData;
        }
        io.to(start.room).emit('gameInitiated', start);
        // Pause execution for 3 seconds
        await new Promise(resolve => setTimeout(resolve, 1500));
        io.to(start.room).emit('startGame', start);
        // To emmit score_updated with default value.
        let user_points = start.table.users.map((user) =>
        {
            return {
                user_id: user.id,
                score: 0,
                points: 0,
                bonusPoints: 0,
                life : 3,
                pawnScore : user.tokens
            };
        });
        io.to(start.room).emit('score_updated', {
            room: start.room,
            score_data: user_points,
        });

        let turnTimer = config.turnTimer;
        let tableData = await redisCache.getRecordsByKeyRedis(`table_${myRoom.room}`);
        if('turnTime' in tableData) { turnTimer = tableData.turnTime; }
        // to take 2 second buffer time to life lost
        turnTimer += 2;
        await bullQueue.add(
            {
                name: "playerTurnQueue",
                payload: { room: start.room },
            },
            {
                delay: turnTimer * 1000
            }
        );
    }

    async function calculateWinAmount(amount, payoutConfig) {
        let room_fee = amount;
        let payConfig = payoutConfig;
        // console.log(" >>>", room_fee, payConfig)
        let winnerConfig = {};
        let totalWinning = 0;
        for (let i = 0; i < 4; i++) {
            if (payConfig && payConfig[i]) {
                // console.log("payConfig[i] * room_fee  >>>", payConfig[i] * room_fee)
                winnerConfig[i] = Math.floor(payConfig[i] * room_fee);
                // console.log("totalWinning , winnerConfig[i] >>>", totalWinning, winnerConfig[i])

                totalWinning = totalWinning + winnerConfig[i]
            }
        }
        // console.log("calculateWinAmount -- ", winnerConfig, totalWinning)
        return {
            payoutConfig: winnerConfig,
            totalWinning: totalWinning
        }
    }
    async function removePlayer(tableD) {
        const users = [];
        // console.log("tableD >>>", tableD)
        if (tableD && tableD.players.length < tableD.no_of_players) {
            for (let i = 0; i < 4; i++) {
                if (tableD.players[i] && tableD.players[i].id) {
                    // console.log("Here>>", i, tableD.players[i])
                    users.push(tableD.players[i])
                }
            }
            // console.log(">>USERS>>", users)
            return users;
        }
    }
    async function processEvents(rez, myRoom, socket) {
        if (_.isArray(rez.events)) {
        //    console.log('Process Events ::: ', JSON.stringify(rez.events));
            if (rez.events.length > 0) {
                for (const d of rez.events) {
                    let logData = {
                        level: 'debugg',
                        meta: d
                    };
                    d.name ? logDNA.log(`Event ${d.name} fired`, logData) : '';
                    deleteObjectProperty(logData);
                    setTimeout(
                        async function () {
                            if (d.name == 'make_move') {
                                let params_data = {
                                    room: d.room,
                                };
                                var checkTabel = await _TableInstance.istableExists(params_data, myRoom);
                                if (checkTabel.current_turn != d.data.position) {
                                    return;
                                }
                            }
                            //console.log(d.name + ' firing after delay of ' + d.delay, d.name, d, new Date());
                            if (d.type == 'users_including_me') {
                                for (const g of d.users) {
                                    var id = await Socketz.getSocket(g);
                                    // console.log("user", g);
                                    // console.log("socket", id);
                                    io.to(id).emit(d.name, d.data);
                                }
                                if(d.name == 'leaveTable'){
                                    delete d.data.room;
                                    delete d.data.refund;
                                    io.to(id).emit(d.name, d.data);
                                }
                            } else if (d.type == 'users_excluding_me') {
                                for (const g of d.users) {
                                    var id = await Socketz.getSocket(g);
                                    // console.log("user", g);
                                    // console.log("socket", id);
                                    socket.to(id).emit(d.name, d.data);
                                }
                            } else if (d.type == 'room_including_me') {
                                /**
                                 * Last move animation & equal turns logic at backend.
                                 * 
                                 * To check that make_diceroll event has occured.
                                 * To check time expire.
                                 **/
                                let gameTime = await checkGameExpireTime(myRoom);
                                if (gameTime.isTimeExpired) {
                                    //To check player has equal turn or not.
                                    let equalTurn = await _TableInstance.checkPlayerEqualTurn(myRoom, d.data.position);
                                    //console.log('Player position', d.data.position);
                                    if (equalTurn) {
                                        if (d.name == 'make_diceroll' && d.data.extra_move_animation == false) {
                                            let data = await _TableInstance.checkwinnerOfTournament(d.room, myRoom);
                                            myRoom = data.table;
                                            processEvents(data, myRoom, socket);
                                        } else if (d.name == 'end_game') {
                                            let compressedResponse = d.data.game_data.map((cur) => {
                                                return {
                                                    "player_index":cur.player_index,
                                                    "id":cur.id,
                                                    "name":cur.name,
                                                    "rank":cur.rank,
                                                    "amount":cur.amount,
                                                    "is_left":cur.is_left,
                                                    "score":cur.score,
                                                };
                                            });
                                            d.data.game_data = compressedResponse;
                                            io.to(d.room).emit(d.name, d.data);
                                            // To remove all player from room after game end.
                                            io.of('/').in(d.room).clients((error, clients) => {
                                                clients.forEach(socketId => {
                                                //   io.sockets.sockets[socketId].leave(d.room);
                                                const socket = io.sockets.sockets[socketId];
                                                if (socket) {
                                                    socket.leave(d.room);
                                                }
                                                });
                                            });
                                        } else if (d.name == 'make_move') {
                                            io.to(d.room).emit(d.name, d.data);
                                        } else if (d.name == 'life_deduct') {
                                            io.to(d.room).emit(d.name, d.data);
                                        } else if (d.name == 'score_updated') {
                                            let getmyRoom = await redisCache.getRecordsByKeyRedis(d.room);
                                            let user_score = getmyRoom.users.map((user) =>
                                            {
                                                return {
                                                    user_id: user.id,
                                                    score: user.points + user.bonusPoints,
                                                    points: user.points,
                                                    bonusPoints: user.bonusPoints,
                                                    life : user.life,
                                                    pawnScore : user.tokens
                                                };
                                            });
                                            d.data.score_data = user_score;
                                            io.to(d.room).emit(d.name, d.data);
                                        }  
                                        else {
                                            io.to(d.room).emit(d.name, d.data);
                                        }
                                    } else {
                                        if(d.name == 'playerLeft') {
                                            let compressedData = d.data.game_data.map((cur) => {
                                                return {
                                                    //player_index, name, rank, amount, id, score, is_left
                                                    "player_index":cur.player_index,
                                                    "id":cur.id,
                                                    "name":cur.name,
                                                    "rank":cur.rank,
                                                    "amount":cur.amount,
                                                    "is_left":cur.is_left,
                                                    "score":cur.score,
                                                };
                                            });
                                            // final compressed response to emmit.
                                            d.data.game_data = compressedData;
                                            io.to(d.room).emit(d.name, d.data);
                                        } else if(d.name == 'make_diceroll') {
                                            delete d.data.turn_timestamp;
                                            delete d.data.server_time;

                                            io.to(d.room).emit(d.name, d.data);
                                        } else if(d.name == 'make_move'){
                                            delete d.data.turn_timestamp;
                                            delete d.data.server_time;

                                            io.to(d.room).emit(d.name, d.data);
                                        } else if(d.name == 'end_game') {
                                            // re-arrange the obj before send to unity :player_index, name, rank, amount, id, score, is_left
                                            let compressedData = d.data.game_data.map((cur) => {
                                                return {
                                                    "player_index":cur.player_index,
                                                    "id":cur.id,
                                                    "name":cur.name,
                                                    "rank":cur.rank,
                                                    "amount":cur.amount,
                                                    "is_left":cur.is_left,
                                                    "score":cur.score,
                                                };
                                            });
                                            d.data.game_data = compressedData;
                                            io.to(d.room).emit(d.name, d.data);
                                            // To remove all player from room after game end.
                                            io.of('/').in(d.room).clients((error, clients) => {
                                                clients.forEach(socketId => {
                                                //   io.sockets.sockets[socketId].leave(d.room);
                                                const socket = io.sockets.sockets[socketId];
                                                if (socket) {
                                                    socket.leave(d.room);
                                                }
                                                });
                                            });
                                        } else if (d.name == 'score_updated') {
                                            let getmyRoom = await redisCache.getRecordsByKeyRedis(d.room);
                                            let user_score = getmyRoom.users.map((user) =>
                                            {
                                                return {
                                                    user_id: user.id,
                                                    score: user.points + user.bonusPoints,
                                                    points: user.points,
                                                    bonusPoints: user.bonusPoints,
                                                    life : user.life,
                                                    pawnScore : user.tokens
                                                };
                                            });
                                            d.data.score_data = user_score;
                                            io.to(d.room).emit(d.name, d.data);
                                        }
                                        else {
                                            io.to(d.room).emit(d.name, d.data);
                                        }
                                    }
                                } else {
                                    if(d.name == 'score_updated') {
                                        let getmyRoom = await redisCache.getRecordsByKeyRedis(d.room);
                                        let user_score = getmyRoom.users.map((user) =>
                                        {
                                            return {
                                                user_id: user.id,
                                                score: user.points + user.bonusPoints,
                                                points: user.points,
                                                bonusPoints: user.bonusPoints,
                                                life : user.life,
                                                pawnScore : user.tokens
                                            };
                                        });
                                        d.data.score_data = user_score;
                                        io.to(d.room).emit(d.name, d.data);
                                    } else {
                                        io.to(d.room).emit(d.name, d.data);
                                    }
                                }
                            } else if (d.type == 'room_excluding_me') {
                                if(d.name == 'dice_rolled') {
                                    delete d.data.dices_rolled;
                                    delete d.data.skip_dice;
                                    socket.to(d.room).emit(d.name, d.data);
                                } else if(d.name == 'move_made') {
                                    delete d.data.dices_rolled;
                                    socket.to(d.room).emit(d.name, d.data);  
                                }
                                else {
                                    socket.to(d.room).emit(d.name, d.data);
                                }
                                
                            }

                            if (d.name == 'newTableCreated') {
                                for (const g of d.users) {
                                    var id = await Socketz.getSocketIS(g);
                                    id.join(d.data.table.room, function (err) {
                                        // if (err) return console.log('ERR', err);
                                        // console.log('JOINED new Room, all rooms now >> ', id.rooms);
                                    });
                                }
                            }
                        },
                        d.delay ? d.delay : 0
                    );
                }
            }
        }
    }
    /**
     *  Only for Tournament Game
    */
    async function emitEventsforTournament(rez, myRoom, socket) {
        if (_.isArray(rez.events)) {
            if (rez.events.length > 0) {
                for (const d of rez.events) {
                    let logData = {
                        level: 'debugg',
                        meta: d
                    };
                    d.name ? logDNA.log(`Event ${d.name} fired`, logData) : '';
                    deleteObjectProperty(logData);
                    setTimeout(
                        async function () {
                            if (d.name == 'make_move') {
                                let params_data = {
                                    room: d.room,
                                };
                                var checkTabel = await _TableInstance.istableExists(params_data, myRoom);
                                if (checkTabel.current_turn != d.data.position) {
                                    return;
                                }
                            }
                            
                            if (d.type == 'users_including_me') {
                                for (const g of d.users) {
                                    var id = await Socketz.getSocket(g);
                                    // console.log("user", g);
                                    // console.log("socket", id);
                                    io.to(id).emit(d.name, d.data);
                                }
                                if(d.name == 'leaveTable'){
                                    delete d.data.room;
                                    delete d.data.refund;
                                    io.to(id).emit(d.name, d.data);
                                }
                            } else if (d.type == 'users_excluding_me') {
                                for (const g of d.users) {
                                    var id = await Socketz.getSocket(g);
                                    // console.log("user", g);
                                    // console.log("socket", id);
                                    socket.to(id).emit(d.name, d.data);
                                }
                            } else if (d.type == 'room_including_me') {
                                /**
                                 * To check if maximum turn reached
                                 **/
                                if (myRoom.total_turn === myRoom.users[0].turn) {
                                    if (d.name == 'make_diceroll' && d.data.extra_move_animation == false) {
                                        let data = await _TableInstance.checkwinnerOfTournament_V2(d.room, myRoom);
                                        myRoom = data.table;
                                        processEvents(data, myRoom, socket);
                                    } else if (d.name == 'end_game') {
                                        io.to(d.room).emit(d.name, d.data);
                                        // To remove all player from room after game end.
                                        io.of('/').in(d.room).clients((error, clients) => {
                                            clients.forEach(socketId => {
                                            //   io.sockets.sockets[socketId].leave(d.room);
                                            const socket = io.sockets.sockets[socketId];
                                            if (socket) {
                                                socket.leave(d.room);
                                            }
                                            });
                                        });
                                    } else if (d.name == 'make_move') {
                                        io.to(d.room).emit(d.name, d.data);
                                    } else if (d.name == 'life_deduct') {
                                        io.to(d.room).emit(d.name, d.data);
                                    } else if (d.name == 'score_updated') {
                                        let getmyRoom = await redisCache.getRecordsByKeyRedis(d.room);
                                        let user_score = getmyRoom.users.map((user) =>
                                        {
                                            return {
                                                user_id: user.id,
                                                score: user.points + user.bonusPoints,
                                                points: user.points,
                                                bonusPoints: user.bonusPoints,
                                                life : user.life,
                                                pawnScore : user.tokens
                                            };
                                        });
                                        d.data.score_data = user_score;
                                        io.to(d.room).emit(d.name, d.data);
                                    }  
                                    else {
                                        io.to(d.room).emit(d.name, d.data);
                                    }
                                } else {
                                    if(d.name == 'playerLeft') {
                                        let compressedData = d.data.game_data.map((cur) => {
                                            return {
                                                //player_index, name, rank, amount, id, score, is_left
                                                "player_index":cur.player_index,
                                                "id":cur.id,
                                                "name":cur.name,
                                                "rank":cur.rank,
                                                "amount":cur.amount,
                                                "is_left":cur.is_left,
                                                "score":cur.score,
                                            };
                                        });
                                        // final compressed response to emmit.
                                        d.data.game_data = compressedData;
                                        io.to(d.room).emit(d.name, d.data);
                                    } else if(d.name == 'make_diceroll') {
                                        delete d.data.turn_timestamp;
                                        delete d.data.server_time;

                                        io.to(d.room).emit(d.name, d.data);
                                    } else if(d.name == 'make_move'){
                                        delete d.data.turn_timestamp;
                                        delete d.data.server_time;

                                        io.to(d.room).emit(d.name, d.data);
                                    } else if(d.name == 'end_game') {
                                        io.to(d.room).emit(d.name, d.data);
                                        // To remove all player from room after game end.
                                        io.of('/').in(d.room).clients((error, clients) => {
                                            clients.forEach(socketId => {
                                            //   io.sockets.sockets[socketId].leave(d.room);
                                            const socket = io.sockets.sockets[socketId];
                                            if (socket) {
                                                socket.leave(d.room);
                                            }
                                            });
                                        });
                                    } else if (d.name == 'score_updated') {
                                        let getmyRoom = await redisCache.getRecordsByKeyRedis(d.room);
                                        let user_score = getmyRoom.users.map((user) =>
                                        {
                                            return {
                                                user_id: user.id,
                                                score: user.points + user.bonusPoints,
                                                points: user.points,
                                                bonusPoints: user.bonusPoints,
                                                life : user.life,
                                                pawnScore : user.tokens
                                            };
                                        });
                                        d.data.score_data = user_score;
                                        io.to(d.room).emit(d.name, d.data);
                                    }
                                    else {
                                        io.to(d.room).emit(d.name, d.data);
                                    }
                                }
                            } else if (d.type == 'room_excluding_me') {
                                if(d.name == 'dice_rolled') {
                                    delete d.data.dices_rolled;
                                    delete d.data.skip_dice;
                                    socket.to(d.room).emit(d.name, d.data);
                                } else if(d.name == 'move_made') {
                                    delete d.data.dices_rolled;
                                    socket.to(d.room).emit(d.name, d.data);  
                                }
                                else {
                                    socket.to(d.room).emit(d.name, d.data);
                                }
                                
                            }
                        },
                        d.delay ? d.delay : 0
                    );
                }
            }
        }
    }

    /**
     * The function used to check the gameTime expired or not.
     * @param {room} number means room id
     * 
     * @returns boolean  
     */
    async function checkGameExpireTime(MyRoom) {
        try {
            if (MyRoom.game_started_at) {
                let gameStartTime = MyRoom.game_started_at;
                // To convert New Date() getTime to Second.
                let timeInsecond = (Math.round(new Date().getTime() / 1000) - Math.round(gameStartTime / 1000));
                let tableData = await redisCache.getRecordsByKeyRedis(`table_${MyRoom.room}`);
                let configGameTime = config.gameTime;
                if('gameTime' in tableData) {
                    configGameTime = tableData.gameTime;
                }
                let flag;
                if (timeInsecond >= configGameTime * 60) {
                    flag = true;
                } else {
                    flag = false;
                }
                if (timeInsecond < 0) timeInsecond = 0;

                let timer = configGameTime * 60 - timeInsecond;
                if (timer < 0) {
                    timer = 0
                }
                return {
                    isTimeExpired: flag,
                    time: timer,
                }
            } else {
                return false;
            }

        } catch (err) {
            // To log error
            let logData = {
                level: 'error',
                meta: { 'env' : `${process.env.NODE_ENV}`,'error': err, stackTrace : err.stack}
            };
            logDNA.error('checkGameExpireTime', logData);
        }
    }

    /**
     * The function used to delete object.
     * @param {object} object 
     */
    function deleteObjectProperty(object) {
        Object.keys(object).forEach(key => {
            delete object[key];
        });
    }


    async function processBullEvent(job) {
        if (job.data.name.indexOf('playerTurnQueue') > -1) {
           // console.log("playerTurn event fired", job.data.payload)
            return playerTurn(job.data);
        } else if (job.data.name.indexOf('gameCompletionQueue') > -1) {
            //console.log("checkGameCompletion event fired", job.data.payload)
            return checkGameCompletion(job);
        }
        // else if (job.data.name.indexOf('gameTimer') > -1) {
        //     let latestRoomData = await redisCache.getRecordsByKeyRedis(job.data.payload.room);
        //     let gameTime = await checkGameExpireTime(latestRoomData);
        //     io.to(job.data.payload.room).emit('gameTime', { status: 1, status_code: 200, data: { time: gameTime.time, current_turn: latestRoomData.current_turn } });
          
        //     if (gameTime.time == 0) {
        //         console.error('gameTimer removed------> ' + job.name);
        //         bullQueue.removeRepeatableByKey(job.id);
        //     }
        // }
        else {
           // console.error('Error:: Invalid job name', job.data.name);
        }
    }

    async function playerTurn(job) {
        let params_data = job.payload;        
        try {
            let myRoom = await redisCache.getRecordsByKeyRedis(params_data.room);
            let gamePlayData = await redisCache.getRecordsByKeyRedis('gamePlay_' + params_data.room);
            let checkTabel = await _TableInstance.istableExists(params_data, myRoom);
            if (myRoom != null && myRoom.isGameCompleted) {
                console.log('Game already completed');
                return;
            } else {
                let turnTimer = config.turnTimer;
                let tableData = await redisCache.getRecordsByKeyRedis(`table_${myRoom.room}`);
                if(tableData && 'turnTime' in tableData) { turnTimer = tableData.turnTime; }
                var currTime = parseInt(new Date().getTime());
                if (currTime - checkTabel.start_at > (turnTimer + 2) * 1000) {
                    var id_of_current_turn = await _TableInstance.getMyIdByPossition(
                        params_data,
                        checkTabel.current_turn,
                        myRoom
                    );
                    if (id_of_current_turn != -1) {
                        let currentUser = myRoom.users.find(x => x.id.toString() == id_of_current_turn);
                        if (currentUser && currentUser.is_active && !myRoom.isGameCompleted) {
                            //console.log('SKIPPED for extra life deduct------->>', JSON.stringify(tableD));
                            // for tournament Game
                            let response;
                            if(myRoom.is_it_tournament) {
                                response = await _TableInstance.skipTurnforTournament(params_data, id_of_current_turn, myRoom, gamePlayData);
                            } else {
                                // for regular game
                                response = await _TableInstance.skipTurn(params_data, id_of_current_turn, myRoom, gamePlayData);
                            }

                            myRoom = response.table;
                            gamePlayData = response.gamePlayData;

                            await redisCache.addToRedis(params_data.room, myRoom);
                            await redisCache.addToRedis('gamePlay_' + params_data.room, gamePlayData);

                            let turnTimer = config.turnTimer;
                            let tableData = await redisCache.getRecordsByKeyRedis(`table_${myRoom.room}`);
                            if('turnTime' in tableData) { turnTimer = tableData.turnTime; }
                            turnTimer += 2;
                            turnTimer = turnTimer * 1000;

                            await bullQueue.add(
                                {
                                    name: "playerTurnQueue",
                                    payload: { room: params_data.room },
                                },
                                {
                                    delay: turnTimer
                                }
                            );
                            processEvents(response, myRoom);
                        }
                    }
                }
            }

        }
        catch (err) {
            if(params_data && params_data.room)
            {
            let turnTimer = config.turnTimer;
            let tableData = await redisCache.getRecordsByKeyRedis(`table_${myRoom.room}`);
            if('turnTime' in tableData) { turnTimer = tableData.turnTime; }
            turnTimer += 2;
            turnTimer = turnTimer * 1000;

            await bullQueue.add(
                {
                    name: "playerTurnQueue",
                    payload: { room: params_data.room },
                },
                {
                    delay: turnTimer
                }
            );
            }
            let logData = {
                level: 'error',
                meta: { 'env' : `${process.env.NODE_ENV}`,'error': err, stackTrace : err.stack,'job':JSON.stringify(job)}
            };
            logDNA.error('playerTurn', logData);       
        }

    }

    async function checkGameCompletion(job) {

        let { start, myRoom } = job.data.payload;
        // for tourname game
        if(myRoom.is_it_tournament) {
            // to get letest myRoom data
            const myRoom_turnCount = await redisCache.getRecordsByKeyRedis(myRoom.room);
            // if(myRoom_turnCount.total_turn === myRoom_turnCount.users[0].turn) {
            const remainingTurn = myRoom_turnCount.total_turn - myRoom_turnCount.users[0].turn;
            if (remainingTurn <= 0) {
                // To sent 0 turn at end
                io.to(start.room).emit('turnLeft', { status: 1, data: { turn: remainingTurn} });
                return;
            } else {
                // To sent remaining turn 
                io.to(start.room).emit('turnLeft', { status: 1, data: { turn: remainingTurn} });
                await bullQueue.add(job.data, {
                    delay: 1000
                });
            }

        } else {
            // for regular game
            let gameTime = await checkGameExpireTime(myRoom);
            let latestMyRoom = await redisCache.getRecordsByKeyRedis(myRoom.room);
            if (gameTime && !latestMyRoom.isGameCompleted) {
                //console.log('isGameCompleted ====>', JSON.stringify(latestRoomData));
                io.to(start.room).emit('gameTime', { status: 1, data: { time: gameTime.time, current_turn: -1} });
                if (gameTime.time == 0) {
                    // console.log('gameTimerEnd...........................');
                    // sent event to socket Client for equal ture.                                            
                    let equalTurnPlayerData = await _TableInstance.determineTotalTurn(start.room);
                    io.to(start.room).emit('final_turn_initiated', equalTurnPlayerData);
                    // console.log('final_turn_initiated');
                    return;
                } else {
                    await bullQueue.add(job.data, {
                        delay: 1000
                    });
                }
            }
        }
    }
};
