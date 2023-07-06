const _               = require('lodash');
const {Sockets}       = require('./helper/sockets');
const _TableInstance  = require('./controller/_table');
// const Table           = require('./../api/models/table');
// const {User}          = require('./../api/models/user');
const localization    = require('./../api/service/localization');
const Socketz         = new Sockets();
const requestTemplate = require('../api/service/request-template');
const config          = require('../config');
const ObjectId        = require('mongoose').Types.ObjectId;
const logDNA          = require('../api/service/logDNA');
const redisCache      = require('../api/service/redis-cache');
const { CostExplorer } = require('aws-sdk');
module.exports = function (io)
{
    
    // If the Promise is rejected this will catch it.
    process.on('unhandledRejection', error => {
        GlobalError(error);
    });
    // Global Uncaught Exception.
    process.on('uncaughtException', error => {
        GlobalError(error);
    });
    //The function used to log unhandle exception.
    function GlobalError(error){
        // for logDNA 
        logDNA.log('Global error', {
            level: 'error',
            meta: {'message': error.message, 'stack' : error.stack}
        });
    } 
    
    /**
     * The Socket connection start here
     */
    io.on('connection', function (socket)
    {
        // const sqsService      = require('../api/operations/sqs_fifo_services');
        // for logDNA 
        let logData = {
            level: 'debugg',
            meta: {'socketId': socket.id}
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
        socket.on('fetchGameData', async function(params, callback) {
            try{
            // Start the timer
            const startTime = Date.now();
            let myRoom = await redisCache.getRecordsByKeyRedis(params.room);
            // End the timer
            const endTime = (Date.now() - startTime);
            logDNA.log('fetchGameData::ExecutionTime', {level : 'debugg', meta: {'responseTime' : endTime, 'env' : `${process.env.NODE_ENV}`, 'eventName' : 'fetchGameData'}});
            myRoom.server_time = new Date();
            return callback(myRoom);
        }
        catch(ex)
        {
            console.log("fetchGameData",ex);
        }
        });

        /**
         * ping event used for pinging up the connection.
         * 
         * @param params contains user token.
         * @output return params data as output.
         */
        socket.on('ping', function (params, callback)
        {
            return callback(params);
        });
        // New connection to Socket with Auth
        socket.on('join', async (params, callback) =>
        {
            // Start the timer
            const startTime = Date.now();
            let responseObj = {};
            console.log("Socket join fired", socket.id);
            console.log('TS1 ::', 'join', socket.id, JSON.stringify(params));
            // for logDNA 
            let logData = {
                level: 'debugg',
                meta: {'socketId': socket.id, 'params': params}
            };
            logDNA.log('Socket join fired', logData);
            await redisCache.addToRedis(socket.id, params.token);
            try
            {
                if (!params.token)
                {
                    return callback({
                        status: 0,
                        message: 'No Token provided',
                    });
                }
                
                // End the timer
                const endTime = (Date.now() - startTime);
                // calculate the execution time
                logDNA.log('Join::ExecutionTime', {level : 'debugg', meta: {'responseTime' : endTime, 'env' : `${process.env.NODE_ENV}`, 'eventName' : 'Join'}});
                
                responseObj = {
                    status: 1,
                    message: 'Socket registered successfully',
                    server_time: new Date().getTime().toString(),
                    joined: 0
                };
                return callback(responseObj);
            } catch (err)
            {
                console.log("join",err);   
                // for logDNA 
                let logData = {
                    level: 'error',
                    meta: {'error': err, 'params': params}
                };
                logDNA.log('JOIN :: Event :: Error', logData);

                if (typeof callback == 'function')
                    return callback({
                        status: 0,
                        message: 'An error was encountered. Please join a new game.',
                    });

                console.log("join",err); 
                return callback();   
            }
        });

        socket.on('join_previous', async (params, callback) =>
        {
            // Start the timer
            const startTime = Date.now();
            console.log('TS1 ::', 'join_previous', socket.id, JSON.stringify(params));
            var myId = await Socketz.getId(socket.id);
            try
            {
                if (!myId)
                {   return callback({
                        status: 0,
                        message: 'An error was encountered. Please join a new game.',
                    });
                }
                var rez = await _TableInstance.reconnectIfPlaying(myId);
                if (rez.status == 0)
                {
                    return callback({
                        status: 2,
                        message: 'An error was encountered. Please join a new game.',
                    })
                }
                // If no room to join the game.
                rez.table.room ? socket.join(rez.table.room) : socket.join();
                rez.server_time = new Date();
                rez.table.server_time = new Date();

               // End the timer
                const endTime = (Date.now() - startTime);
                logDNA.log('Join_Previous::ExecutionTime', {level : 'debugg', meta: {'responseTime' : endTime, 'env' : `${process.env.NODE_ENV}`, 'eventName' : 'Join_Previous'}});
                return callback(rez);

            } catch(ex) {
                console.log("join_previous" ,ex );
                return callback({
                    status: 0,
                    message: 'An error was encountered. Please join a new game.',
                });
            }
        });
        socket.on('go_in_background', async () =>
        {
            // for logDNA 
            let logData = {
                level: 'debugg',
                meta: {'socketId': socket.id}
            };
            logDNA.log('user_go_in_background', logData);
            socket.leaveAll();
        });

        socket.on('joinTournament', async (data, callback) =>
        {
            try{
            // Start the timer
            const startTime = Date.now();
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
            console.log("payout -- ", payout);
            params.winningAmount = payout.payoutConfig;
            params.totalWinning = payout.totalWinning;
            params.lobbyId = verifyUser.lobbyId;
            params.entryFee = 0;
            if('entryFee' in verifyUser) { params.entryFee = verifyUser.entryFee };
            logData = {
                level: 'debugg',
                meta: payout
            };
            logDNA.log('Calculate win ammount',logData);
            // To delete object
            // deleteObjectProperty(payout);
            console.log("params >>>>>", params);
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
           
            //var rez = await _TableInstance.joinTournament(params, myId, socket);
            //let myRoom = await redisCache.getRecordsByKeyRedis(params.room);
            //let gamePlayData = await redisCache.getRecordsByKeyRedis('gamePlay_'+params.room);
            var rez = await _TableInstance.joinTournamentV2(params, params.entryFee, myId, us,0);
            callback(rez.callback);
            if (rez.callback.status == 1)
            {  
                let myRoom=rez.myRoom;
                let gamePlayData = await redisCache.getRecordsByKeyRedis('gamePlay_'+myRoom.room);
                await redisCache.addToRedis(myRoom.room,myRoom);
                await redisCache.addToRedis('gamePlay_'+myRoom.room ,gamePlayData);
                // console.log('GAME-PLAY-DATA-1', JSON.stringify(gamePlayData));
                socket.join(rez.callback.table.room);
                processEvents(rez,myRoom);
                var params_data = {
                    room: rez.callback.table.room,
                };

                var start = await _TableInstance.startIfPossibleTournament(params_data, myRoom, gamePlayData);

                console.log("Start", JSON.stringify(start));
                if (start)
                {
                    let reqData = await _TableInstance.getGameUsersData(start);
                    let startGame = await requestTemplate.post(`startgame`, reqData)

                    if (!startGame.isSuccess)
                    {
                        let i = 0;
                        leaveUser(i, start);
                        async function leaveUser(i, start)
                        {
                            if (i < 4)
                            {
                                console.log("start game error > ", start.table)
                                if (start.table.users[i] && start.table.users[i].id)
                                {
                                    let data = {
                                        room: params_data.room,
                                        isRefund: true
                                    }
                                    var resp = await _TableInstance.leaveTable(data, start.table.users[i].id, socket, myRoom,gamePlayData);
                                    processEvents(resp, myRoom);
                                    i++;
                                    leaveUser(i, start);
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
                    setInterval(async function ()
                    {
                        let data = {
                            room: start.room
                        }
                        //TODO: 
                        checkTabel = await _TableInstance.istableExists(data,myRoom);
                        let latestRoomData = await redisCache.getRecordsByKeyRedis(start.room);
                        // IF game completed, then clear the time interval.
                        if (latestRoomData!= null && latestRoomData.isGameCompleted == true)
                        {
                            clearInterval(this);
                        } else if(latestRoomData.isGameCompleted == 'undefined'){
                            clearInterval(this);
                        }

                        let gameTime = await checkGameExpireTime(latestRoomData);
                        if(gameTime) { 
                            //console.log('isGameCompleted ====>', JSON.stringify(latestRoomData));
                            io.to(start.room).emit('gameTime', {status: 1, status_code: 200, data: {time : gameTime.time, current_turn: latestRoomData.current_turn}}); 
                            if(gameTime.time == 0){
                                console.log('gameTimerEnd...........................');
                                // sent event to socket Client for equal ture.                                            
                                let equalTurnPlayerData = await _TableInstance.determineTotalTurn(start.room);
                                io.to(start.room).emit('final_turn_initiated', equalTurnPlayerData);
                                clearInterval(this);
                            }
                        }
                    }, 1000);     
                     await redisCache.addToRedis(myRoom.room,myRoom);
                     await redisCache.addToRedis('gamePlay_'+myRoom.room ,gamePlayData);
                    //  console.log('GAME-PLAY-DATA-2', JSON.stringify(gamePlayData));
                }
                else
                {
                    await Socketz.sleep(40000);
                    myRoom = await redisCache.getRecordsByKeyRedis(myRoom.room);
                    gamePlayData=await redisCache.getRecordsByKeyRedis('gamePlay_'+ myRoom.room);
                    // let tableD = await Table.findOne({
                    //     room: params_data.room
                    // });
                    let tableD = await redisCache.getRecordsByKeyRedis(`table_${params_data.room}`);
                    if (tableD && tableD.players.length < tableD.no_of_players)
                    {
                        for (let i = 0; i < 4; i++)
                        {
                            if (tableD.players[i] && tableD.players[i].id)
                            {
                                let data = {
                                    room: tableD.room,
                                    gameNotStarted: 'true',
                                    isRefund: true
                                }
                                let rez = await _TableInstance.leaveTable(data, tableD.players[i].id, socket, myRoom, gamePlayData);
                                console.log("rez--", rez);
                                processEvents(rez, myRoom);
                            }
                        }
                    }
                }
            }
            // End the timer
            const endTime = (Date.now() - startTime);
            logDNA.log('JoinTournament::ExecutionTime', {level : 'debugg', meta: {'responseTime' : endTime, 'env' : `${process.env.NODE_ENV}`, 'eventName' : 'JoinTournament'}});
        }
        catch(ex)
        {
            console.log("joinTournament " ,ex );
            return callback(); 
        }
        });

        // Leave Table / Quit Game
        socket.on('leaveTable', async (params, callback) =>
        {
            // Start the timer
            const startTime = Date.now();

            // let tableD = await Table.findOne({
            //     room: params.room
            // });
            let tableD = await redisCache.getRecordsByKeyRedis(`table_${params.room}`);
            if(tableD!= null && tableD.isGameCompleted) {
                return callback({'isGameCompleted': true, 'room': params.room});
            }

            try{
                //console.log('TS1 ::', 'leaveTable', socket.id, JSON.stringify(params));
                let myId = await Socketz.getId(socket.id);
                await Socketz.userGone(socket.id, params.token);
                params.isRefund = false;
                let myRoom = await redisCache.getRecordsByKeyRedis(params.room);
                let gamePlayData = await redisCache.getRecordsByKeyRedis('gamePlay_'+ params.room);
                let response = await _TableInstance.leaveTable(params, myId, socket, myRoom,gamePlayData);
                await redisCache.addToRedis(myRoom.room,myRoom);
                //console.log("leaveTable end response: " + JSON.stringify(response) );
                //await redisCache.addToRedis('gamePlay_'+myRoom.room ,gamePlayData);

                //To add left user details with callback events.
                // let playerPosition = response.events[0].data.position;
                // let leftPlayerData = myRoom.users.filter((ele) => ele.position == playerPosition);
                const userData = [];
                myRoom.users.map((cur) => {
                    userData.push({
                        "player_index":cur.position,
                        "numeric_id":cur.numeric_id,
                        "id":cur.id,
                        "name":cur.name,
                        "rank":0,
                        "amount":0,
                        "is_left": cur.hasOwnProperty('is_left') ? cur.is_left : false,
                        "score":0
                    });
                },[])
                response.callback.room = myRoom.room; 
                response.callback.game_data = userData;
                callback(response.callback);
                // To remove a particular socket ID from a room
                let socketIdToRemove = socket.id;
                io.sockets.sockets[socketIdToRemove].leave(myRoom.room);
                // End the timer
                const endTime = (Date.now() - startTime);
                logDNA.log('LeaveTable::ExecutionTime', {level : 'debugg', meta: {'responseTime' : endTime, 'env' : `${process.env.NODE_ENV}`, 'eventName' : 'LeaveTable'}});

                if (response.callback && response.callback.status == 1) processEvents(response, myRoom);

            }
            catch(ex)
            {
                //console.log("leaveTable", ex);
                return callback(); 
            }

        });

        socket.on('tournamnt_dice_rolled', async (params, callback) =>
        {
            try{
            // Start the timer
            const startTime = Date.now();
            //console.log("TS1 ::", 'tournamnt_dice_rolled', socket.id, JSON.stringify(params), new Date());
           // console.log(socket.data_name, " Rolled ", params.dice_value);
            let myId = await Socketz.getId(socket.id);
             // redis call by room.
            let myRoom = await redisCache.getRecordsByKeyRedis(params.room);
            let gamePlayData = await redisCache.getRecordsByKeyRedis('gamePlay_'+params.room); 
            let response = await _TableInstance.tournamntDiceRolled(socket, params, myId, myRoom,gamePlayData);
            //console.log('tournamnt_dice_rolled callback', params, response.callback);
            await redisCache.addToRedis(myRoom.room,myRoom);
            await redisCache.addToRedis('gamePlay_'+myRoom.room ,gamePlayData);
            // console.log('GAME-PLAY-DATA-3', JSON.stringify(gamePlayData));
            callback(response.callback);
            // End the timer
            const endTime = (Date.now() - startTime);
            logDNA.log('Tournamnt_dice_rolled::ExecutionTime', {level : 'debugg', meta: {'responseTime' : endTime, 'env' : `${process.env.NODE_ENV}`, 'eventName' : 'Tournamnt_dice_rolled'}});

            if (response.callback.status == 1) processEvents(response, myRoom);
            }
            catch(error)
            {
                console.log('dice_roll_error', error);
                logDNA.log('dice_roll_error', {level: 'error', meta: {'error' : error}});
                return callback(); 
            }
        });

        socket.on('tournament_move_made', async (params, callback) =>
        {
            try{
            // Start the timer
            const startTime = Date.now();
            console.log("Tournament_move_made ::", JSON.stringify(params));
            console.log(socket.data_name, ' Moved token of tournament ', params.token_index, ' By ', params.dice_value, ' places');

            let myId = await Socketz.getId(socket.id);
            let myRoom = await redisCache.getRecordsByKeyRedis(params.room);
            let gamePlayData = await redisCache.getRecordsByKeyRedis('gamePlay_'+params.room);
            let response = await _TableInstance.moveTourney(params, myId, gamePlayData, myRoom);
            console.log('Tournament_move_made callback', response);
            await redisCache.addToRedis(myRoom.room,myRoom);
            await redisCache.addToRedis('gamePlay_'+myRoom.room ,gamePlayData);
            // console.log('GAME-PLAY-DATA-4', JSON.stringify(gamePlayData));
            callback(response.callback);

            // End the timer
            const endTime = (Date.now() - startTime);
            logDNA.log('Tournament_move_made::ExecutionTime', {level : 'debugg', meta: {'responseTime' : endTime, 'env' : `${process.env.NODE_ENV}`, 'eventName' : 'Tournament_move_made'}});

            if (response.callback.status == 1) processEvents(response, myRoom);
            }
            catch(err)
            {
                console.error("tournament_move_made", err);
                return callback(); 
            }
        });
        //Skip Turn
        socket.on('skip_turn', async (params, callback) =>
        {
            // Start the timer
            const startTime = Date.now();

            // let tableD = await Table.findOne({
            //     room: params.room
            // });
            let tableD = await redisCache.getRecordsByKeyRedis(`table_${params.room}`);
            if(tableD!= null && tableD.isGameCompleted) {
                return callback({'isGameCompleted': true, 'room': params.room});
            }

            try{
            console.log('TS1 ::', 'skip_turn', socket.id, JSON.stringify(params));
            let myId = await Socketz.getId(socket.id);
            let myRoom = await redisCache.getRecordsByKeyRedis(params.room);
            let gamePlayData = await redisCache.getRecordsByKeyRedis('gamePlay_'+params.room);
            let response = await _TableInstance.skipTurn(params, myId, myRoom, gamePlayData);
            console.log("SKIP TURN RES", response);
            myRoom = response.table;
            gamePlayData = response.gameData;
            await redisCache.addToRedis(myRoom.room,myRoom);
            await redisCache.addToRedis('gamePlay_'+myRoom.room ,gamePlayData);
            // console.log('GAME-PLAY-DATA-5', JSON.stringify(gamePlayData));
            callback(response.callback);

            // End the timer
            const endTime = (Date.now() - startTime);
            logDNA.log('Skip_turn::ExecutionTime', {level : 'debugg', meta: {'responseTime' : endTime, 'env' : `${process.env.NODE_ENV}`, 'eventName' : 'Skip_turn'}});

            processEvents(response, myRoom);
            }
            catch(ex)
            {
                console.log("skip_turn",ex );
                return callback(); 
            }
        });
        // This event for Socket Disconnect.
        socket.on('disconnect', async () =>
        {
            logDNA.log('DEVICE :: Disconnected', logData);
            // var myId = Socketz.getId(socket.id);
            //Socketz.userGone(socket.id);
        });

        async function startTournament(start, socket, myRoom, gamePlayData)
        {
            var params_data = {
                room: start.room,
            };
            //call api to deduct money 
            start.server_time = new Date();
            start.turn_timestamp = new Date();
            myRoom.turn_timestamp = new Date();
            io.to(start.room).emit('startGame', start);
            process.env.CURRENT_TURN_POSITION = myRoom.current_turn;
            //console.log("AFter startGame fire - ", new Date());
            setInterval(async function ()
            {
                try{
                let myRoom = await redisCache.getRecordsByKeyRedis(params_data.room);
                let gamePlayData = await redisCache.getRecordsByKeyRedis('gamePlay_'+params_data.room);
                let checkTabel = await _TableInstance.istableExists(params_data,myRoom);
                if (myRoom!= null && myRoom.isGameCompleted)
                {
                    clearInterval(this);

                } else
                {
                    var currTime = parseInt(new Date().getTime());
                    if (currTime - checkTabel.start_at > (config.turnTimer + 2) * 1000)
                    {   
                        var id_of_current_turn = await _TableInstance.getMyIdByPossition(
                            params_data,
                            checkTabel.current_turn,
                            myRoom
                        );
                         //console.log("curr turn " + id_of_current_turn);
                        if (id_of_current_turn != -1)
                        {
                            let currentUser= myRoom.users.find(x=>x.id.toString() == id_of_current_turn);
                            if(currentUser && currentUser.is_active && !myRoom.isGameCompleted)
                            {
                                //console.log('SKIPPED for extra life deduct------->>', JSON.stringify(tableD));
                                let response = await _TableInstance.skipTurn(params_data, id_of_current_turn, myRoom, gamePlayData);
                                myRoom = response.table;
                                gamePlayData = response.gamePlayData;
        
                                await redisCache.addToRedis(params_data.room, myRoom);
                                await redisCache.addToRedis('gamePlay_'+params_data.room ,gamePlayData);
                                processEvents(response, myRoom);
                            }
                        }
                    }
                }
            }
            catch(ex)
            {
                console.log("interval exception ", ex);
            }
            }, 1500);
        }
        async function calculateWinAmount(amount, payoutConfig)
        {
            let room_fee = amount;
            let payConfig = payoutConfig;
            console.log(" >>>", room_fee, payConfig)
            let winnerConfig = {};
            let totalWinning = 0;
            for (let i = 0; i < 4; i++)
            {
                if (payConfig && payConfig[i])
                {
                    console.log("payConfig[i] * room_fee  >>>", payConfig[i] * room_fee)
                    winnerConfig[i] = Math.floor(payConfig[i] * room_fee);
                    console.log("totalWinning , winnerConfig[i] >>>", totalWinning, winnerConfig[i])

                    totalWinning = totalWinning + winnerConfig[i]
                }
            }
            console.log("calculateWinAmount -- ", winnerConfig, totalWinning)
            return {
                payoutConfig: winnerConfig,
                totalWinning: totalWinning
            }
        }
        async function removePlayer(tableD)
        {
            const users = [];
            console.log("tableD >>>", tableD)
            if (tableD && tableD.players.length < tableD.no_of_players)
            {
                for (let i = 0; i < 4; i++)
                {
                    if (tableD.players[i] && tableD.players[i].id)
                    {
                        console.log("Here>>", i, tableD.players[i])
                        users.push(tableD.players[i])
                    }
                }
                console.log(">>USERS>>", users)
                return users;
            }
        }
        async function processEvents(rez,myRoom)
        {
            if (_.isArray(rez.events))
            {
                console.log('Process Events ::: ', JSON.stringify(rez.events));               
                if (rez.events.length > 0)
                {
                    for (const d of rez.events)
                    {
                        let logData = {
                            level: 'debugg',
                            meta: d
                        };
                        d.name ? logDNA.log(`Event ${d.name} fired`, logData) : '';
                        deleteObjectProperty(logData);
                        setTimeout(
                            async function ()
                            {   
                                if (d.name == 'make_move')
                                {
                                    let params_data = {
                                        room: d.room,
                                    };
                                    var checkTabel = await _TableInstance.istableExists(params_data, myRoom);
                                    if (checkTabel.current_turn != d.data.position)
                                    {
                                        return;
                                    }
                                }
                                console.log(d.name + ' firing after delay of ' + d.delay, d.name, d, new Date());
                                if (d.type == 'users_including_me')
                                {
                                    for (const g of d.users)
                                    {
                                        var id = await Socketz.getSocket(g);
                                        console.log("user", g);
                                        console.log("socket", id);
                                        io.to(id).emit(d.name, d.data);
                                    }
                                } else if (d.type == 'users_excluding_me')
                                {
                                    for (const g of d.users)
                                    {
                                        var id = await Socketz.getSocket(g);
                                        console.log("user", g);
                                        console.log("socket", id);
                                        socket.to(id).emit(d.name, d.data);
                                    }
                                } else if (d.type == 'room_including_me')
                                {
                                    /**
                                     * Last move animation & equal turns logic at backend.
                                     * 
                                     * To check that make_diceroll event has occured.
                                     * To check time expire.
                                     **/

                                    let gameTime = await checkGameExpireTime(myRoom);
                                    if(gameTime.isTimeExpired) {
                                        //To check player has equal turn or not.
                                        let equalTurn = await _TableInstance.checkPlayerEqualTurn(myRoom, d.data.position);
                                        //console.log('Player position', d.data.position);
                                        if(equalTurn){
                                            if(d.name == 'make_diceroll' && d.data.extra_move_animation == false) {
                                                let data = await _TableInstance.checkwinnerOfTournament(d.room, myRoom);
                                                myRoom = data.table;
                                                processEvents(data,myRoom);                                            
                                            } else if(d.name == 'end_game') {                                             
                                                io.to(d.room).emit(d.name, d.data);
                                            } else if(d.name == 'make_move') {
                                                io.to(d.room).emit(d.name, d.data);
                                            } else if(d.name == 'life_deduct') {
                                                io.to(d.room).emit(d.name, d.data);
                                            } else {
                                                io.to(d.room).emit(d.name, d.data);
                                            }
                                        } else {
                                            io.to(d.room).emit(d.name, d.data);
                                        }
                                    } else {
                                        io.to(d.room).emit(d.name, d.data);
                                    }                                 
                                } else if (d.type == 'room_excluding_me')
                                {                                  
                                    console.log("room_excluding_me", d.data);
                                    socket.to(d.room).emit(d.name, d.data);                                   
                                }

                                if (d.name == 'newTableCreated')
                                {
                                    for (const g of d.users)
                                    {
                                        var id = await Socketz.getSocketIS(g);
                                        id.join(d.data.table.room, function (err)
                                        {
                                            // if (err) return console.log('ERR', err);
                                            // console.log('JOINED new Room, all rooms now >> ', id.rooms);
                                        });
                                    }
                                }
                            },
                            d.delay ? d.delay : 0
                        );
                            // if(rez.events[0].data.position != null) {
                            //     process.env.CURRENT_TURN_POSITION = rez.events[0].data.position;
                            // } else if(rez.events[0].data.player_index != null) {
                            //     process.env.CURRENT_TURN_POSITION = rez.events[0].data.player_index;
                            // }
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
                if(MyRoom.game_started_at) {     
                    let gameStartTime = MyRoom.game_started_at;
                    // To convert New Date() getTime to Second.
                    let timeInsecond = (Math.round(new Date().getTime() / 1000) - Math.round(gameStartTime / 1000));

                    let flag;
                    if (timeInsecond >= config.gameTime * 60) { 
                        flag =  true;
                    } else {
                        flag =  false;
                    }
                    if (timeInsecond < 0) timeInsecond = 0;

                    let timer = config.gameTime * 60 - timeInsecond;
                    if(timer < 0){
                        timer = 0
                    }
                    return {
                        isTimeExpired : flag,
                        time : timer,
                    }
                } else {
                    return false;
                }

            } catch(Execption) {
                // To log error
                logDNA.log('checkGameExpireTime', {level: 'error',meta: {'error' : Execption}});
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
    });

};
