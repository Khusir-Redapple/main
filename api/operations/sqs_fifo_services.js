//Required module for SQS queue based messaging service
const {Sockets}       = require('../../socket/helper/sockets');
const Socketz         = new Sockets();

const aws               = require('aws-sdk');
aws.config              = new aws.Config();
aws.config.region       = process.env.AWS_REGION || 'ap-south-2';
const sqsAwsInstance    = new aws.SQS();
const QueueUrl          = 'https://sqs.ap-south-2.amazonaws.com/478885374249/stage-ludo.fifo';
const logDNA            = require('../../api/service/logDNA');
const events            = require('events');
const eventEmiter       = new events.EventEmitter();

const requestTemplate   = require('../service/request-template');
const {User}            = require('../models/user');
const Table             = require('../models/table');
const ObjectId          = require('mongoose').Types.ObjectId;
const _TableInstance    = require('../../socket/controller/_table');

module.exports.SendMessage = (socket, io, params) =>
{
    // Setup the sendMessage parameter object
    const msgId = String(new Date().getTime());
    const sendParamsToSqs = {
        MessageBody: JSON.stringify({
            token: params,
            date: (new Date()).toISOString(),
        }),
        MessageGroupId: msgId,
        MessageDeduplicationId: msgId,
        QueueUrl: QueueUrl,
    };
    // To return result.        
    sqsAwsInstance.sendMessage(sendParamsToSqs, function (error, data)
    {
        if (error)
        {
            // for logDNA
            logDNA.log('sqs insertions unsuccessfull', {level: 'error', meta: error});
        } else
        {
            // for logDNA
            logDNA.log('sqs insertion successfull', {level: 'debugg', meta: data});
            eventEmiter.emit('receiveMessage', socket);
        }
    });

    eventEmiter.on('receiveMessage', (socket) =>
    {
        // Setup the receiveMessage parameters
        const params = {
            QueueUrl: QueueUrl,
            MaxNumberOfMessages: 10,
            VisibilityTimeout: 10,
            WaitTimeSeconds: 0,
        };
        sqsAwsInstance.receiveMessage(params, (error, receiveResult) =>
        {
            if (error)
            {
                // for logDNA.
                logDNA.log('sqs receive unsuccessfull', {level: 'error', meta: error});
            } else if (!receiveResult.Messages)
            {
                logDNA.log('empty queue', {level: 'debugg', meta: receiveResult});
            } else
            {
                if (typeof (receiveResult.Messages) == 'object')
                {
                    receiveResult.Messages.map(async (data) =>
                    {
                        let token = (JSON.parse(data.Body)).token;
                        await sqsDataProcess(token)
                    });
                }
            }
            async function calculateWinAmount(amount, payoutConfig)
            {
                let room_fee        = amount;
                let payConfig       = payoutConfig;
                let winnerConfig    = {};
                let totalWinning    = 0;
                for (let i = 0; i < 4; i++)
                {
                    if (payConfig && payConfig[i])
                    {
                        winnerConfig[i] = Math.floor(payConfig[i] * room_fee);
                        totalWinning    = totalWinning + winnerConfig[i]
                    }
                }
                return {
                    payoutConfig: winnerConfig,
                    totalWinning: totalWinning
                }
            }
            async function startTournament(start, socket)
            {
                var params_data = {
                    room: start.room,
                };
                //call api to deduct money 
                io.to(start.room).emit('startGame', start);
                setInterval(async function ()
                {
                    let checkTabel = await _TableInstance.istableExists(params_data);
                    if (!checkTabel.status)
                    {
                        clearInterval(this);
                    } else
                    {
                        var currTime = parseInt(new Date().getTime());
                        if (currTime - checkTabel.start_at > (10 + 2) * 1000)
                        {
                            var id_of_current_turn = await _TableInstance.getMyIdByPossition(
                                params_data,
                                checkTabel.current_turn
                            );
                            if (id_of_current_turn != -1)
                            {
                                let response = await _TableInstance.skipTurn(params_data, id_of_current_turn);
                                processEvents(response);
                            }
                        }
                    }
                }, 1500);
            }
            async function processEvents(rez)
            {
                if (_.isArray(rez.events))
                {
                    if (rez.events.length > 0)
                    {
                        for (const d of rez.events)
                        {
                            let logData = {
                                level: 'debugg',
                                meta: d
                            };
                            d.name ? logDNA.log(`Event ${d.name} fired`, logData) : '';
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
                                        /**
                                         * Last move animation & equal turns logic at backend.
                                         * 
                                         * To check that make_diceroll event has occured.
                                         * To check time expire.
                                         **/
                                        let gameTime = await checkGameExpireTime(d.room);
    
                                        if(gameTime.isTimeExpired) {
                                            if(d.name == 'make_diceroll') {
                                                let data = await _TableInstance.checkwinnerOfTournament(d.room);
                                                processEvents(data);                                            
                                            } else if(d.name == 'end_game') {
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
            async function checkGameExpireTime(room) {
                try {
                    let tableD = await Table.findOne({
                        room: room,
                    });                
                    let gameStartTime = tableD.game_started_at;
                    // To convert New Date() getTime to Second.
                    let timeInsecond = (Math.round(new Date().getTime() / 1000) - Math.round(gameStartTime / 1000));

                    let flag;
                    if (timeInsecond >= 10 * 60) { 
                        flag =  true;
                    } else {
                        flag =  false;
                    }
                    if (timeInsecond < 0) timeInsecond = 0;

                    let timer = 10 * 60 - timeInsecond;
                    if(timer < 0){
                        timer = 0
                    }
                    return {
                        isTimeExpired : flag,
                        time : timer,
                    }

                } catch(Execption) {
                    // To log error
                    logDNA.log('checkGameExpireTime', {level: 'error',meta: Execption});
                }
            }
            async function sqsDataProcess(token)
            {
                let verifyUser = await requestTemplate.post(`verifyuser`, {"token": token});
                if (!verifyUser.isSuccess)
                {
                    // return callback({
                    //     status: 0,
                    //     message: verifyUser.error || localization.apiError,
                    // });
                    io.to(socket.id).emit('joinTournamentEvent', {'status': 0, 'message': verifyUser.error || 'API having some issue.'});
                }
                let params = verifyUser.data;
                params.room_fee = verifyUser.amount.toString();
                params.no_of_players = verifyUser.participants.toString();
                let payout = await calculateWinAmount(verifyUser.amount, verifyUser.payoutConfig);
                params.winningAmount = payout.payoutConfig;
                params.totalWinning = payout.totalWinning;
                logData = {
                    level: 'debugg',
                    meta: payout
                };
                // logDNA.log('Calculate win ammount', logData);
                if (!params || !params.user_id)
                {
                    // return callback({
                    //     status: 0,
                    //     message: localization.missingParamError,
                    // });
                    io.to(socket.id).emit('joinTournamentEvent', {'status': 0, 'message': 'Please check the parameters passed'});
                }
                let us = await User.findOne({
                    'numeric_id': params.user_id,
                });
                console.log("us >>", us);
                if (us)
                {
                    socket.data_id = us._id.toString();
                    socket.data_name = us.name;
                    socket.join(socket.data_id);
                    Socketz.updateSocket(us._id, socket);
                    // db query to update the data by user _id.                    
                    await User.findOneAndUpdate(
                        {
                            _id: ObjectId(us._id),
                        },
                        {
                            $set: {
                                'token': token,
                                'lobbyId': verifyUser.lobbyId,
                                'joinedAt': new Date().getTime()
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
                        token: params.token,
                        joinedAt: new Date().getTime()
                    });
                    console.log("newUser > ", newUser);
                    us = await newUser.save();
                    console.log("us > ", us)
                    socket.data_id = us._id.toString();
                    socket.data_name = us.name;
                    socket.join(socket.data_id);
                    Socketz.updateSocket(us._id, socket);
                }
                
                var myId = Socketz.getId(socket.id);
                var rez = await _TableInstance.joinTournament(params, myId, socket);
                if (rez.callback.status == 1)
                {
                    socket.join(rez.callback.table.room);
                    processEvents(rez);
                    var params_data = {
                        room: rez.callback.table.room,
                    };
                    var start = await _TableInstance.startIfPossibleTournament(params_data);
                    console.log("Start", start);

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
                                        var resp = await _TableInstance.leaveTable(data, start.table.users[i].id);
                                        processEvents(resp);
                                        i++;
                                        leaveUser(i, start);
                                    }
                                }
                            }
                            // return callback({
                            //     status: 0,
                            //     message: startGame.error,
                            // });                            
                            io.to(socket.id).emit('joinTournamentEvent', {'status': 0, 'message': startGame.error});
                        }
                        // if tournament possible
                        await startTournament(start, socket);
                        setInterval(async function ()
                        {
                            let data = {
                                room: start.room
                            }
                            checkTabel = await _TableInstance.istableExists(data);
                            if (!checkTabel.status)
                            {
                                clearInterval(this);
                            }
                            let gameTime = await checkGameExpireTime(start.room);
                            console.log("game timer room - ", start.room, gameTime);
                            io.to(start.room).emit('gameTime', {status: 1, status_code: 200, data: {time: gameTime.time}});
                        }, 1000);
                    }
                    else
                    {
                        await Socketz.sleep(16000);
                        let tableD = await Table.findOne({
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
                                    let rez = await _TableInstance.leaveTable(data, tableD.players[i].id);
                                    processEvents(rez);
                                }
                            }
                        }
                    }
                } else {
                    io.to(socket.id).emit('joinTournamentEvent', rez.callback);
                }
            }

            // To arrange params for batch delete.
            const deleteMessageBatchParams = {
                Entries: receiveResult.Messages.map(message =>
                {
                    return {
                        Id: message.MessageId,
                        ReceiptHandle: message.ReceiptHandle
                    };
                }),
                QueueUrl: QueueUrl
            };
            // To delete message in a batch.
            sqsAwsInstance.deleteMessageBatch(deleteMessageBatchParams, (error, data) =>
            {
                if (error)
                {
                    console.log(error);
                    logDNA.log('sqs delete unsuccessfull', {level: 'error', meta: error});
                }
            });
        });
    });
}
