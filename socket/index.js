const _               = require('lodash');
const {Sockets}       = require('./helper/sockets');
const _TableInstance  = require('./controller/_table');
const Table           = require('./../api/models/table');
const {User}          = require('./../api/models/user');
const localization    = require('./../api/service/localization');
const Socketz         = new Sockets();
const requestTemplate = require('../api/service/request-template');
const config          = require('../config');
const ObjectId        = require('mongoose').Types.ObjectId;
const logDNA          = require('../api/service/logDNA');

module.exports = function (io)
{
    /**
     * The Socket connection start here
     */
    io.on('connection', function (socket)
    {
        // for logDNA 
        let logData = {
            level: 'debugg',
            meta: {'socketId': socket.id}
        };
        logDNA.log('DEVICE :: connected', logData);
        // reset the socket connection for all listeners
        socket.removeAllListeners();

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
            console.log("SOCKET REGISTER CALLED", socket.id);
            console.log('TS1 ::', 'join', socket.id, JSON.stringify(params));
            // for logDNA 
            let logData = {
                level: 'debugg',
                meta: {'socketId': socket.id, 'params': params}
            };
            logDNA.log('JOIN :: event', logData);

            try
            {
                if (!params.token)
                {
                    return callback({
                        status: 0,
                        message: 'No Token provided',
                    });
                }
                let us = await User.findOne({
                    'token': params.token,
                });
                if (!us)
                {
                    var rezObj = {
                        status: 1,
                        message: 'Socket registered successfully',
                        server_time: new Date().getTime().toString(),
                        joined: 0
                    };
                    return callback(rezObj);
                }
                await User.findOneAndUpdate(
                    {
                        _id: ObjectId(us._id),
                    },
                    {
                        $set: {
                            'token': params.token
                        },
                    }
                );
                socket.data_id = us._id.toString();
                socket.data_name = us.name;
                socket.join(socket.data_id);
                await Socketz.updateSocket(us._id, socket);
                startTime = new Date();
                us.save();

                //Check if user already playing
                var rez = await _TableInstance.reconnectIfPlaying(us._id);
                console.log('PLAYER ID :: >>>', us._id);
                console.log('ALREADY PLAYING OR NOT :: >>>', rez);

                var rezObj = {
                    status: 1,
                    message: 'Socket registered successfully',
                    server_time: new Date().getTime().toString(),
                };
                rezObj.joined = rez.status;
                console.log('TS1 ::', 'joinRes', socket.id, JSON.stringify(rezObj));
                return callback(rezObj);
            } catch (err)
            {
                // for logDNA 
                let logData = {
                    level: 'error',
                    meta: {'error': err, 'params': params}
                };
                logDNA.log('JOIN :: Event :: Error', logData);

                if (typeof callback == 'function')
                    return callback({
                        status: 0,
                        message: 'Error occurred, Please try again.',
                    });
            }
        });

        socket.on('join_previous', async (params, callback) =>
        {
            console.log('TS1 ::', 'join_previous', socket.id, JSON.stringify(params));
            var myId = Socketz.getId(socket.id);
            try
            {
                if (!myId)
                {   return callback({
                        status: 0,
                        message: 'Something went wrong!',
                    });
                }
                var rez = await _TableInstance.reconnectIfPlaying(myId);
                if (rez.status == 0)
                {
                    return callback({
                        status: 0,
                        message: 'Table not found.',
                    })
                }
                // If no room to join the game.
                rez.table.room ? socket.join(rez.table.room) : socket.join();
                return callback(rez);

            } catch {
                return callback({
                    status: 0,
                    message: 'You ware removed from game.',
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

            console.log("params >>>>>", params);
            if (!params || !params.user_id)
            {
                return callback({
                    status: 0,
                    message: localization.missingParamError,
                });
            }
            let us = await User.findOne({
                'numeric_id': params.user_id,
            });
            console.log("us >>", us)
            if (us)
            {
                socket.data_id = us._id.toString();
                socket.data_name = us.name;
                socket.join(socket.data_id);
                await Socketz.updateSocket(us._id, socket);
                await User.findOneAndUpdate(
                    {
                        _id: ObjectId(us._id),
                    },
                    {
                        $set: {
                            'token': data.token,
                            'lobbyId': verifyUser.lobbyId
                        },
                    }
                );
            }
            else
            {
                var newUser = new User({
                    name: params.user_name,
                    numeric_id: params.user_id.toString(),
                    lobbyId: verifyUser.lobbyId,
                    profilepic: params.profile_pic,
                    token: params.token
                });
                console.log("newUser > ", newUser)
                us = await newUser.save();
                console.log("us > ", us)
                socket.data_id = us._id.toString();
                socket.data_name = us.name;
                socket.join(socket.data_id);
                await Socketz.updateSocket(us._id, socket);
            }
            var myId = Socketz.getId(socket.id);
            if (!myId)
            {
                console.log('Socket disconnected');
                return callback({
                    status: 0,
                    message: 'Something went wrong! ',
                });
            }
            console.log("myId - ", myId)
            var rez = await _TableInstance.joinTournament(params, myId, socket);
            console.log("JoinTOurnament res >>>", rez.callback.status == 1)
            callback(rez.callback);
            if (rez.callback.status == 1)
            {
                console.log("REZ", rez, rez.callback.table.room);
                socket.join(rez.callback.table.room);
                processEvents(rez);
                var params_data = {
                    room: rez.callback.table.room,
                };

                var start = await _TableInstance.startIfPossibleTournament(params_data);

                console.log("Start", start);

                if (start)
                {
                    console.log("Start 1- ", start.table.users);

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
                                    var resp = await _TableInstance.leaveTable(data, start.table.users[i].id);
                                    processEvents(resp);
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
                    await startTournament(start, socket);
                    let tableD = await Table.findOne({room: params.room});
                    setInterval(async function ()
                    {
                        var data = {
                            room: start.room
                        }
                        checkTabel = await _TableInstance.istableExists(data);
                        if (!checkTabel.status)
                        {
                            clearInterval(this);
                        }
                        const winnerData = await _TableInstance.checkwinnerOfTournament(start.room);
                        console.log("Below Winner Data -after timer--", winnerData)
                        if (winnerData.name && winnerData.name == 'end_game')
                        {
                            var resObj = {events: []};
                            resObj.events.push(winnerData);
                            processEvents(resObj);

                        } else if (winnerData.time)
                        {
                            io.to(start.room).emit('gameTime', {status: 1, status_code: 200, data: winnerData});
                        }
                    }, 1000);        
                }
                else
                {
                    await Socketz.sleep(16000);
                    var tableD = await Table.findOne({
                        room: params_data.room
                    });
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
                                var rez = await _TableInstance.leaveTable(data, tableD.players[i].id);
                                console.log("rez--", rez)
                                processEvents(rez);
                            }
                        }
                    }
                }
            }
        });

        // Leave Table / Quit Game
        socket.on('leaveTable', async (params, callback) =>
        {
            console.log('TS1 ::', 'leaveTable', socket.id, JSON.stringify(params));
            var myId = Socketz.getId(socket.id);
            params.isRefund = false;
            var rez = await _TableInstance.leaveTable(params, myId, socket);
            callback(rez.callback);
            if (rez.callback && rez.callback.status == 1) processEvents(rez);

        });

        socket.on('tournamnt_dice_rolled', async (params, callback) =>
        {
            console.log("TS1 ::", 'tournamnt_dice_rolled', socket.id, JSON.stringify(params), new Date());
            console.log(socket.data_name, " Rolled ", params.dice_value);
            var myId = Socketz.getId(socket.id);
            var rez = await _TableInstance.tournamntDiceRolled(socket, params, myId);
            console.log('tournamnt_dice_rolled callback', new Date());
            callback(rez.callback);
            if (rez.callback.status == 1) processEvents(rez);
        });

        socket.on('tournament_move_made', async (params, callback) =>
        {
            console.log("Tournament_move_made ::", JSON.stringify(params));
            console.log(socket.data_name, ' Moved token of tournament ', params.token_index, ' By ', params.dice_value, ' places');

            var myId = Socketz.getId(socket.id);
            var rez = await _TableInstance.moveTourney(params, myId);
            console.log("TS2 ::", 'makeMove callback =============>>>>', rez);
            callback(rez.callback);
            if (rez.callback.status == 1) processEvents(rez);
        });
        //Skip Turn
        socket.on('skip_turn', async (params, callback) =>
        {
            console.log('TS1 ::', 'skip_turn', socket.id, JSON.stringify(params));
            var myId = Socketz.getId(socket.id);
            var rez = await _TableInstance.skipTurn(params, myId);
            console.log("SKIP TURN RES", rez);
            callback(rez.callback);
            processEvents(rez);
        });
        // This event for Socket Disconnect.
        socket.on('disconnect', async () =>
        {
            logDNA.log('DEVICE :: Disconnected', logData);
            var myId = Socketz.getId(socket.id);
            await Socketz.userGone(socket.id);
        });

        async function startTournament(start, socket)
        {
            var params_data = {
                room: start.room,
            };
            //call api to deduct money 
            io.to(start.room).emit('startGame', start);
            console.log("AFter startGame fire - ", new Date());

            setInterval(async function ()
            {
                // console.log('Checking Timeout');

                var checkTabel = await _TableInstance.istableExists(params_data);
                if (!checkTabel.status)
                {
                    clearInterval(this);
                } else
                {
                    var currTime = parseInt(new Date().getTime());
                    if (currTime - checkTabel.start_at > (config.turnTimer + 1) * 1000)
                    {
                        console.log("IN timeOut ------------", new Date())
                        var id_of_current_turn = await _TableInstance.getMyIdByPossition(
                            params_data,
                            checkTabel.current_turn
                        );
                        if (id_of_current_turn != -1)
                        {
                            var rez = await _TableInstance.skipTurn(params_data, id_of_current_turn);
                            processEvents(rez);
                        }
                    }
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
        async function processEvents(rez)
        {
            if (_.isArray(rez.events))
            {
                console.log('rez.event', JSON.stringify(rez.events));
                if (rez.events.length > 0)
                {
                    for (const d of rez.events)
                    {
                        setTimeout(
                            async function ()
                            {
                                if (d.name == 'make_move')
                                {
                                    let params_data = {
                                        room: d.room,
                                    };
                                    var checkTabel = await _TableInstance.istableExists(params_data);
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
                                    io.to(d.room).emit(d.name, d.data);
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
                    }
                }
            }
        }

    });

};
