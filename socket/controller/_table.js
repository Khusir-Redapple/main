const _             = require('lodash');
const {User}        = require('./../../api/models/user');
const Table         = require('./../../api/models/table');
let Service         = require('./../../api/service');
const config        = require('./../../config');
const localization  = require('./../../api/service/localization');
let ObjectId        = require('mongoose').Types.ObjectId;
const requestTemplate = require('../../api/service/request-template');
const {_Tables}     = require('../utils/_tables');
const _tab          = new _Tables();
const redisCache    = require('../../api/service/redis-cache');
module.exports = {
    //Roll dice for tournament
    tournamntDiceRolled: async function (socket, params, id, myRoom, gamePlayData)
    {
        let isJackpot = false;
        let resObj = {callback: {status: 1, message: localization.success}, events: []};
        let threeSix=false;
        // VALIDATE PARAMS
        if (!params) return {callback: {status: 0, message: localization.missingParamError}};
        if (!params.room) return {callback: {status: 0, message: localization.missingParamError}};
        // CHECK IF I EXIST IN THIS ROOM
        var myPos = await _tab.getMyPosition(params.room, id, myRoom);
        if (myPos == -1) return {callback: {status: 0, message: localization.noDataFound}};
        let check = await _tab.isCurrentTurnMine(params.room, myPos, myRoom);
        if (!check)
        {
            return {callback: {status: 0, message: localization.noDataFound}};
        }
        // GET DICE RANDOM
        let DICE_ROLLED = await _tab.getMyDice(params.room, id, myRoom, gamePlayData);
        //console.log('DICE_ROLLED ====>>>>>', DICE_ROLLED);
        if (DICE_ROLLED > 6 || DICE_ROLLED < 0) return {callback: {status: 0, message: localization.noDataFound}};
        
        resObj.callback.dice = DICE_ROLLED;
        let dices_rolled = await _tab.gePlayerDices(params.room, myPos, myRoom, gamePlayData);
        //console.log("value got ", dices_rolled);
        let verify = dices_rolled.every((val, i, arr) => val === 6)
        //console.log("verify", verify);
        if (verify && dices_rolled.length == 3) {isJackpot = true}
        dices_rolled = await _tab.gePlayerDices(params.room, myPos, myRoom, gamePlayData);
        //console.log("value got ", dices_rolled);
        resObj.callback.dices_rolled = dices_rolled;

        // ADD DICEROLLED EVENT 
        let event = {
            type: 'room_excluding_me',
            delay: 0,
            room: params.room,
            name: 'dice_rolled',
            data: {
                position: myPos,
                room: params.room,
                dice_value: DICE_ROLLED,
                dices_rolled: dices_rolled,
                skip_dice: false
            },
        };
        // to add dice skip, bug_no_64, Ex: if 1 pawn is two steps away from home, when i roll a five then the roll will be skipped. So, need a skipped feedback for this case
        resObj.callback.skip_dice = false;

        // console.log('EVENT_PUSHED', event);
        resObj.events.push(event);
        var movePossible = await _tab.isMovePossible(params.room, id, myRoom);
        // IF MOVE POSSIBLE FROM CURRENT DICES & Position

        const jackPOT = await _tab.jackPot(params.room, id, myRoom);
        let sixCounts = await _tab.getSix(params.room, id, myRoom);
        //console.log("sixCounts : ", sixCounts);

        // six count issue 
        // if(sixCounts == 1 && dices_rolled[0] != 6) {
        //     await _tab.setSix(params.room, id, myRoom);
        //     sixCounts = await _tab.getSix(params.room, id, myRoom);
        // }
        /**
         * To check current dice rolled value is 6 and move not possible. 
         * then user should't get next chance.
         */
        // IF 3 times 6
        if (sixCounts == 2 && dices_rolled[0] == 6)
        {
            console.log('SCRAP CURRENT DICES & PASS NEXT DICE_ROLL');
            console.log("1_"+ params.room + "_"+myPos + "_"+myRoom)
            //  SCRAP CURRENT DICES & PASS NEXT DICE_ROLL
            await _tab.scrapTurn(params.room, myPos, myRoom);
             console.log(' DICE_ROLL TO NEXT');
             console.log("1_"+ params.room + "_"+myPos + "_"+myRoom)
            // DICE_ROLL TO NEXT

            await _tab.setSix(params.room, id, myRoom);
            console.log('setSix');
            // if consecutive 3 six happans the reset pending bonus.
            console.log('reset pending bonus');
            await _tab.useBonus(params.room, id, myRoom);

            console.log("1_"+ params.room + "_"+myPos + "_"+myRoom)
            let nextPos = await _tab.getNextPosition(params.room, myPos, myRoom);
            console.log('update turn 1');
            await _tab.updateCurrentTurn(params.room, nextPos, 'roll', myPos, 0, myRoom);
            let DICE_ROLLED_RES = await _tab.rollDice(params.room, id, myRoom);
            let DICE_ROLLED;
            if(DICE_ROLLED_RES) {
            myRoom = DICE_ROLLED_RES.table;
            DICE_ROLLED = DICE_ROLLED_RES.returnDiceValue;
            }
            _tab.diceRolled(params.room, nextPos, DICE_ROLLED, myRoom, gamePlayData);
            dices_rolled  = await _tab.gePlayerDices(params.room, nextPos, myRoom, gamePlayData);
            
            gamePlayData.data.game_time = await _tab.setGameTime(myRoom);
            console.log('game time from non movable event', gamePlayData.data.game_time);
            await _tab.sendToSqsAndResetGamePlayData(params.room, myRoom, gamePlayData, myPos);

            // to add dice skip, bug_no_64, Ex: if 1 pawn is two steps away from home, when i roll a five then the roll will be skipped. So, need a skipped feedback for this case
            resObj.callback.skip_dice = true;
            threeSix=true;
            // SEND EVENT
            let event = {
                type: 'room_including_me',
                room: params.room,
                delay: 2000,//2000,
                name: 'make_diceroll',
                data: {
                    room: params.room,
                    position: nextPos,
                    tokens: await _tab.getTokens(params.room, myRoom),
                    dice: DICE_ROLLED,
                    dices_rolled: dices_rolled,
                    turn_start_at: config.turnTimer,
                    extra_move_animation: false,
                    skip_dice: true,
                    turn_timestamp : myRoom.turn_timestamp,
                    server_time : new Date(),
                },
            };
            myRoom = await _tab.clearDices(params.room, myPos, myRoom);
            resObj.events.push(event);
        }
        if (movePossible)
        {
            console.log('[MOVE POSSIBLE DICE ROLLED]');
            let timer = 150; // previously it was 500
            let myPos = await _tab.getMyPosition(params.room, id, myRoom);
            //  MAKE_MOVE TO ME
            let nextPos = await _tab.getNextPosition(params.room, myPos, myRoom);
            console.log("movePossible >>> sixcount >>", sixCounts, dices_rolled[0], myPos, dices_rolled)
           //revisit
           
            //if (sixCounts == 2 && dices_rolled[0] == 6) 
            if (threeSix) 
            {
                console.log('update turn 2');
               // await _tab.updateCurrentTurn(params.room, nextPos, 'roll', myPos,0,myRoom);
            }
            else {
                console.log('update turn 3');
               await  _tab.updateCurrentTurn(params.room, myPos, 'move', -1, 1, myRoom)
            };
            let dices_roll = await _tab.gePlayerDices(params.room, myPos,myRoom, gamePlayData);
            // to add dice skip, bug_no_64, Ex: if 1 pawn is two steps away from home, when i roll a five then the roll will be skipped. So, need a skipped feedback for this case
            resObj.callback.skip_dice = threeSix;

            let event = {
                type: 'room_including_me',
                room: params.room,
                delay: timer,
                name: 'make_move',
                data: {
                    room: params.room,
                    position: myPos,
                    dices_rolled: dices_roll,
                    turn_start_at: config.turnTimer,
                    skip_dice: threeSix,
                    turn_timestamp : myRoom.turn_timestamp,
                    server_time : new Date(),
                },
            };
            resObj.events.push(event);
        }
        // ELSE // if both are false
        if (!movePossible && !jackPOT)
        {
            console.log('[MOVE IMPOSSIBLE DICE ROLLED]');
            if (DICE_ROLLED != 6)
            {
                console.log('[DICE ROLLED NOT SIX]');
                //  SCRAP CURRENT DICES & PASS NEXT DICE_ROLL
                _tab.scrapTurn(params.room, myPos, myRoom);
                // DICE_ROLL TO NEXT
                let timer = 1500;
                let nextPos = await _tab.getNextPosition(params.room, myPos, myRoom);
                console.log('update turn 4');
                await _tab.updateCurrentTurn(params.room, nextPos, 'roll', myPos,0, myRoom);
                let dices_rolled = await _tab.gePlayerDices(params.room, nextPos, myRoom, gamePlayData);
                let DICE_ROLLED_RES = await _tab.rollDice(params.room, id, myRoom);
                let DICE_ROLLED;
                if(DICE_ROLLED_RES) {
                    myRoom = DICE_ROLLED_RES.table;
                    DICE_ROLLED = DICE_ROLLED_RES.returnDiceValue;
                }
                await _tab.diceRolled(params.room, nextPos, DICE_ROLLED, myRoom, gamePlayData);
                
                gamePlayData.data.game_time = await _tab.setGameTime(myRoom);
                console.log('game time from non movable event', gamePlayData.data.game_time);
                await _tab.sendToSqsAndResetGamePlayData(params.room, myRoom, gamePlayData, myPos);
                // to add dice skip, bug_no_64, Ex: if 1 pawn is two steps away from home, when i roll a five then the roll will be skipped. So, need a skipped feedback for this case
                resObj.callback.skip_dice = true;

                let event = {
                    type: 'room_including_me',
                    room: params.room,
                    delay: timer,
                    name: 'make_diceroll',
                    data: {
                        room: params.room,
                        position: nextPos,
                        tokens: await _tab.getTokens(params.room, myRoom),
                        dice: DICE_ROLLED,
                        dices_rolled: dices_rolled,
                        turn_start_at: config.turnTimer,
                        extra_move_animation: false,
                        skip_dice: true,
                        turn_timestamp : myRoom.turn_timestamp,
                        server_time : new Date(),
                    },
                };
                resObj.events.push(event);
            }
            /**
             * Bug No: 37
             * when the movable pawn has less than 6 steps to move then we are getting extra move
             */
            else if (movePossible == false && DICE_ROLLED == 6)
            {
                console.log('[DICE ROLLED NOT SIX]');
                // reset bonus dice roll & six count.
                await _tab.setSix(params.room, id, myRoom);
                await _tab.useBonus(params.room, id, myRoom);
                //  SCRAP CURRENT DICES & PASS NEXT DICE_ROLL
                _tab.scrapTurn(params.room, myPos, myRoom);
                // DICE_ROLL TO NEXT
                let timer = 1500;
                let nextPos = await _tab.getNextPosition(params.room, myPos, myRoom);
                console.log('update turn 5');
                await _tab.updateCurrentTurn(params.room, nextPos, 'roll', myPos, 0,myRoom);
                let dices_rolled = await _tab.gePlayerDices(params.room, nextPos, myRoom, gamePlayData);
                let DICE_ROLLED_RES = await _tab.rollDice(params.room, id, myRoom);
                let DICE_ROLLED;
                if(DICE_ROLLED_RES) {
                    myRoom = DICE_ROLLED_RES.table;
                    DICE_ROLLED = DICE_ROLLED_RES.returnDiceValue;
                }
                await _tab.diceRolled(params.room, nextPos, DICE_ROLLED, myRoom, gamePlayData);
                gamePlayData.data.game_time = await _tab.setGameTime(myRoom);
                console.log('game time from non movable event', gamePlayData.data.game_time);
                await _tab.sendToSqsAndResetGamePlayData(params.room, myRoom, gamePlayData, myPos);
                // to add dice skip, bug_no_64, Ex: if 1 pawn is two steps away from home, when i roll a five then the roll will be skipped. So, need a skipped feedback for this case
                resObj.callback.skip_dice = true;
                let event = {
                    type: 'room_including_me',
                    room: params.room,
                    delay: timer,
                    name: 'make_diceroll',
                    data: {
                        room: params.room,
                        position: nextPos,
                        tokens: await _tab.getTokens(params.room, myRoom),
                        dice: DICE_ROLLED,
                        dices_rolled: dices_rolled,
                        turn_start_at: config.turnTimer,
                        extra_move_animation: false,
                        skip_dice: true,
                        turn_timestamp : myRoom.turn_timestamp,
                        server_time : new Date(),
                    },
                };
                resObj.events.push(event);
            }

            else
            {
                // await _tab.addBonus(params.room, id, 1);
                // Send 'roll' to same player
                //let DICE_ROLLED = _tab.rollDice(params.room, id);
                let DICE_ROLLED = Math.floor(Math.random() * 6) + 1;
                var myPos = await _tab.getMyPosition(params.room, id, myRoom);
                await _tab.diceRolled(params.room, myPos, DICE_ROLLED, myRoom, gamePlayData);
                console.log('update turn 6');
                await _tab.updateCurrentTurn(params.room, myPos, 'roll', -1, 0,myRoom);
                let dices_rolled = await _tab.gePlayerDices(params.room, myPos, myRoom, gamePlayData);
                // console.log('[DICE ROLLED SIX]', dices_rolled);

                // to add dice skip, bug_no_64, Ex: if 1 pawn is two steps away from home, when i roll a five then the roll will be skipped. So, need a skipped feedback for this case
                resObj.callback.skip_dice = false;
                let event = {
                    type: 'room_including_me',
                    room: params.room,
                    delay: 2210,
                    name: 'make_diceroll',
                    data: {
                        room: params.room,
                        position: myPos,
                        tokens: await _tab.getTokens(params.room, myRoom),
                        dice: DICE_ROLLED,
                        dices_rolled: dices_rolled,
                        turn_start_at: config.turnTimer,
                        extra_move_animation: true,
                        skip_dice: false,
                        turn_timestamp : myRoom.turn_timestamp,
                        server_time : new Date(),
                    },
                };
                resObj.events.push(event);
            }

        }
        let events = {
            type: 'room_including_me',
            room: params.room,
            delay: 1000,
            name: 'score_updated',
            data: {
                room: params.room,
                score_data: _tab.getPoints(params.room, myRoom),
            },
        };
        resObj.events.push(events);
        return resObj;
    },

    //Move Made
    moveTourney: async function (params, id, gamePlayData, myRoom)
    {
        // console.log('Move Made', params);
        try
        {
            // To capture pawn tap time
            let pawnTime = await _tab.setPawnMoveTime(myRoom);
            gamePlayData.data.pawn_move_time.push(pawnTime);

            // VALIDATION
            if (!params)
            {
                return {callback: {status: 0, message: localization.missingParamError}};
            } else if (!params.room)
            {
                return {callback: {status: 0, message: localization.missingParamError}};
            } else if (!params.token_index)
            {
                return {callback: {status: 0, message: localization.missingParamError}};
            } else if (!params.dice_value)
            {
                return {callback: {status: 0, message: localization.missingParamError}};
            } else if (parseInt(params.dice_value) > 6)
            {
                return {callback: {status: 0, message: localization.missingParamError}};
            }
            params.token_index = parseInt(params.token_index);
            params.dice_value = parseInt(params.dice_value);

            let resObj = {callback: {status: 1, message: localization.success, isKillable : false}, events: []};
            let myPos = await _tab.getMyPosition(params.room, id, myRoom);
            //if (myPos == -1) return {callback: {status: 0, message: localization.noDataFound}};
            
            // get dice_value from user property.
            //params.dice_value = myRoom.users[myPos].dices_rolled;
            //console.log('position===>', myPos, params.dice_value);
            let params_data = {
                room: params.room,
            };
            var checkTabel = await this.istableExists(params_data,myRoom); // added to solve backword token movement 
            if (checkTabel.current_turn != myPos)
            {
                console.log("IN moveTourney IF - ", checkTabel, myPos); //to handle token revert issue - NO1-I44
                return;
            }
            let diceVales = [];
            diceVales.push(params.dice_value)
            // const allEqual = diceVales => diceVales.every(v => v === 6);
            if (params.dice_value == 6)
            {
                await _tab.addBonus(params.room, id, 1, 'six', myRoom, gamePlayData); //remove this for not giving 2nd turn on 6
                await _tab.addSix(params.room, id, myRoom);
            } else {
                await _tab.setSix(params.room, id, myRoom);
            }

            // Check if move is possible
            var movePossibleExact = _tab.isMovePossibleExact(
                params.dice_value,
                params.room,
                id,
                params.token_index,
                myRoom
            );
            console.log('Tournament movePossible >>', movePossibleExact);
            // var tableD = await Table.findOne({
            //     room: params.room,
            // });

            if (!movePossibleExact)
            {
                // if move not possible.
                if (params.dice_value == 6)
                {
                    //  SCRAP CURRENT DICES & PASS NEXT DICE_ROLL
                    await _tab.scrapTurn(params.room, myPos, myRoom);
                    // DICE_ROLL TO NEXT
                    let nextPos = await _tab.getNextPosition(params.room, myPos, myRoom);
                    await _tab.scrapTurn(params.room, nextPos, myRoom);
                    console.log('update turn 7');
                    await _tab.updateCurrentTurn(params.room, nextPos, 'roll', myPos, 0,myRoom);
                    let dices_rolled = await _tab.gePlayerDices(params.room, nextPos, myRoom, gamePlayData);
                    let DICE_ROLLED_RES = await _tab.rollDice(params.room, id, myRoom);
                    let DICE_ROLLED;
                    if(DICE_ROLLED_RES) {
                        myRoom = DICE_ROLLED_RES.table;
                        DICE_ROLLED = DICE_ROLLED_RES.returnDiceValue;
                    }
                    await _tab.diceRolled(params.room, nextPos, DICE_ROLLED, myRoom, gamePlayData);
                    let event = {
                        type: 'room_including_me',
                        room: params.room,
                        delay: 1500,
                        name: 'make_diceroll',
                        data: {
                            room: params.room,
                            position: nextPos,
                            tokens: await _tab.getTokens(params.room, myRoom),
                            dice: DICE_ROLLED,
                            dices_rolled: dices_rolled,
                            turn_start_at: config.turnTimer,
                            extra_move_animation: false,
                            turn_timestamp : myRoom.turn_timestamp,
                            server_time : new Date(),
                        },
                    };
                    resObj.events.push(event);
                } else
                {
                    // Send 'roll' to same player
                    console.log('update turn 8');
                    let nextPos = await _tab.getNextPosition(params.room, myPos, myRoom);
                    //await _tab.updateCurrentTurn(params.room, myPos, 'roll', -1, 0,myRoom);
                    await _tab.updateCurrentTurn(params.room, nextPos, 'roll', -1, 0,myRoom);

                    // let DICE_ROLLED = _tab.rollDice(params.room, id);
                    let DICE_ROLLED = Math.floor(Math.random() * 6) + 1;
                    // console.log('[DICE VALUE SIX]', DICE_ROLLED);
                    await _tab.diceRolled(params.room, myPos, DICE_ROLLED, myRoom, gamePlayData);
                    let dices_rolled = await _tab.gePlayerDices(params.room, myPos, myRoom, gamePlayData);
                    // console.log('[DICE VALUE SIX]', dices_rolled, myPos);
                    // SEND EVENT
                    let event = {
                        type: 'room_including_me',
                        room: params.room,
                        delay: 1500,
                        name: 'make_diceroll',
                        data: {
                            room: params.room,
                            position: nextPos,
                            tokens: await _tab.getTokens(params.room, myRoom),
                            dice: DICE_ROLLED,
                            dices_rolled: dices_rolled,
                            turn_start_at: config.turnTimer,
                            extra_move_animation: true,
                            turn_timestamp : myRoom.turn_timestamp,
                            server_time : new Date(),
                        },
                    };

                    resObj.events.push(event);
                }
                // SEND EVENT
                // update the gamePlay data at the time of skip happen for non moveble event.
                gamePlayData.data.game_time = await _tab.setGameTime(myRoom);
                let user_points = 0;
                gamePlayData.data.points_per_diceRoll.map(function(ele) {
                    user_points += ele;
                });
                gamePlayData.data.points = user_points + (+gamePlayData.data.total_move);                           
                gamePlayData.data.player_score = myRoom.users[myPos].points + myRoom.users[myPos].bonusPoints;
                await _tab.sendToSqsAndResetGamePlayData(params.room, myRoom, gamePlayData, myPos);

            } else
            {
                console.log('[MOVE POSSIBLE EXACT]');
                let moveBonusCheck = false;
                // Make move, Remove dicevalue & get CURRENT_POSITION of token
                var resp = await _tab.makeMoveForTournament(params.dice_value, params.room, id, params.token_index, myRoom, gamePlayData);
                myRoom = resp.table;
                gamePlayData = resp.gamePlayData;
                var token_position = resp.token_position;
                let dices_rolled = await _tab.gePlayerDices(params.room, myPos, myRoom, gamePlayData);
                //console.log('TOK POS----', token_position, dices_rolled);
                let checkPointActivated = _tab.checkPointActive(params.room, myPos,  myRoom, gamePlayData);
                myRoom = checkPointActivated.table;
                gamePlayData = checkPointActivated.gamePlayData;
                // let homeAnimation = (token_position == 56 ) : true ? false ;
                // Add move_made Event
                let moveMadeEvent = {
                    type: 'room_excluding_me',//'room_excluding_me',
                    room: params.room,
                    name: 'move_made',
                    data: {
                        room: params.room,
                        player_index: myPos,
                        token_index: params.token_index,
                        dice_value: params.dice_value,
                        dices_rolled: dices_rolled,
                        isKillable : false,
                        // safeZoneAnimation:checkPointActivated, 
                        // homeAnimation: homeAnimation
                    },
                };
                resObj.events.push(moveMadeEvent);

                var killed = false;
                let killTimer = 4000;
                // if CURRENT_POSITION == 56
                if (token_position == 56)
                {
                    console.log('[BEFORE HOME]');
                    /**
                     * Bug NO: 39
                     * If a cut/home happens with a six, then only one extra move should be given
                    */
                    if (params.dice_value != 6)
                    {
                        // Add extra Bonus
                       await _tab.addBonus(params.room, id, 1, "Home", myRoom, gamePlayData);
                       await _tab.addBonusPoints(params.room, id, 50, 1, 'home_base_bonus', myRoom, gamePlayData);
                    }
                    else if (params.dice_value == 6)
                    {
                        // If home happans with six, then extra_roll_reason should be home.
                        if(gamePlayData.data.extra_roll_reason.includes("six")) 
                        {
                            gamePlayData.data.extra_roll_reason.map((ele,index) => {
                                if(ele == 'six'){
                                    gamePlayData.data.extra_roll_reason.splice(index,1);
                                }
                            });
                        }

                        // Add one bonus if home happans on Six.
                        await _tab.addBonus(params.room, id, 0, "Home", myRoom, gamePlayData);
                        await _tab.addBonusPoints(params.room, id, 50, 1, 'home_base_bonus', myRoom, gamePlayData);
                    }
                    // Check if allHome
                    const allHomeRes = _tab.allHome(params.room, id, myRoom);
                    let allHome = allHomeRes
                    if(allHomeRes) {
                        myRoom = allHome.table;
                    }
                    
                    if (allHome)
                    {
                        // Add TurnComplete Event
                        let turnCompleteEvent = {
                            type: 'room_including_me',
                            room: params.room,
                            delay: 2000,
                            name: 'complete_turn',
                            data: {
                                room: params.room,
                                rank: allHome.rank,
                                player_position: allHome.position,
                            },
                        };
                        resObj.events.push(turnCompleteEvent);

                        // Check if EndGame Possible
                        var endGameRes = await _tab.calculateGameEndData(params.room, myRoom.win_amount, myRoom);
                        let endGame;
                        if(endGameRes) {
                            myRoom = endGameRes.table;
                            endGame = endGameRes.rank;
                        }

                        if (endGame)
                        {
                            var tableD = await Table.findOne({
                                room: params.room,
                            });

                            // Update values in user wallets & table data [DB]
                            // console.log('tableD::', tableD);
                            if (tableD)
                            {
                                console.log("GAME END :: >>>>>>>");
                                // in redis updated isGameCompleted property
                                myRoom.isGameCompleted = true;
                                await redisCache.addToRedis(params.room, myRoom);
                                endGame.map(async (eGame) =>
                                {
                                    tableD.players.map(async (playersTable) =>
                                    {
                                        if (eGame.id.toString() == playersTable.id.toString())
                                        {
                                            playersTable.rank = eGame.rank;
                                            playersTable.pl += eGame.amount;
                                        }
                                    });
                                });

                                tableD.game_completed_at = new Date().getTime();
                                tableD.isGameCompleted   = true;
                                tableD
                                    .save()
                                    .then((d) =>
                                    {
                                        // console.log(d);
                                    })
                                    .catch((e) =>
                                    {
                                        // console.log('Error::', e);
                                    });
                            }

                            // Update values in user wallets & table data [DB]
                            let event = {
                                type: 'room_including_me',
                                room: params.room,
                                delay: 2000,
                                name: 'end_game',
                                data: {
                                    room: params.room,
                                    game_data: endGame,
                                },
                            };
                            resObj.events.push(event);
                            let reqData = await this.getEndGameData(event.data, myRoom.room_fee);
                            console.log("END-GAME-DATA-1", reqData);
                            let startGame = await requestTemplate.post(`endgame`, reqData)
                            // if (!startGame.isSuccess)
                            // {
                            //     return {callback: {status: 0, message: startGame.error}};
                            // }
                            // send 
                            let user_points = 0;
                            gamePlayData.data.points_per_diceRoll.map(function(ele) {
                                user_points += ele;
                            });
                            console.log("DICE VALUE BONUS ===>",  gamePlayData.data.points_per_diceRoll);
                            console.log("AFTER ADDITION ===>",  user_points);
                            
                            
                            gamePlayData.data.player_score += user_points;
                            gamePlayData.data.points += user_points;
                            await _tab.sendToSqsAndResetGamePlayData(params.room, myRoom, gamePlayData, myPos);
                        }
                        // Else [!endGame]
                        else
                        {
                            //  SCRAP CURRENT DICES & PASS NEXT DICE_ROLL
                            let sixCounts = await _tab.setSix(params.room, id, myRoom);
                            console.log("set six...2")
                            await _tab.scrapTurn(params.room, myPos, myRoom);
                            // DICE_ROLL TO NEXT
                            let nextPos = await _tab.getNextPosition(params.room, myPos, myRoom);
                            console.log('update turn 9');
                            await _tab.updateCurrentTurn(params.room, nextPos, 'roll', myPos, 0,myRoom);
                            let dices_rolled = await _tab.gePlayerDices(params.room, nextPos, myRoom, gamePlayData);
                            let DICE_ROLLED_RES = await _tab.rollDice(params.room, id, myRoom);
                            let DICE_ROLLED;
                            if(DICE_ROLLED_RES) {
                                myRoom = DICE_ROLLED_RES.table;
                                DICE_ROLLED = DICE_ROLLED_RES.returnDiceValue;
                            }
                            await _tab.diceRolled(params.room, nextPos, DICE_ROLLED, myRoom, gamePlayData);
                            await _tab.sendToSqsAndResetGamePlayData(params.room, myRoom, gamePlayData, myPos);

                            // SEND EVENT
                            let event = {
                                type: 'room_including_me',
                                room: params.room,
                                delay: 1500,
                                name: 'make_diceroll',
                                data: {
                                    room: params.room,
                                    position: nextPos,
                                    tokens: await _tab.getTokens(params.room, myRoom),
                                    dice: DICE_ROLLED,
                                    dices_rolled: dices_rolled,
                                    turn_start_at: config.turnTimer,
                                    extra_move_animation: false,
                                    turn_timestamp : myRoom.turn_timestamp,
                                    server_time : new Date(),
                                },
                            };
                            resObj.events.push(event);
                        }
                    }
                    // Else [!allHome]
                    else
                    {
                        moveBonusCheck = true;
                    }
                }
                // Else [!56]
                else
                {
                    console.log('[BEFORE NOT HOME]');
                    // Check If Killing Possible (Kill & Get Tokens)
                    // 
                    console.log("can i kill true.........")
                    try
                    {
                        console.log('gamePlayDatNew: ' + JSON.stringify(gamePlayData));
                        
                        var canIKillRes = await _tab.CanIKill(params.room, id, params.token_index, myPos, myRoom, gamePlayData);            
                       
                        myRoom = canIKillRes.myRoom;
                        gamePlayData = canIKillRes.gameData;
                        // added new line
                        //await redisCache.addToRedis('gamePlay_'+myRoom.room ,gamePlayData);

                        console.log("canIKill >>>", canIKillRes)
                        let canIKill=canIKillRes.dead_possible;
                        if (canIKill)
                        {
                            console.log("canIKill true:::", canIKill[0])
                            if (canIKill[0].movebleBox < 15) killTimer = 2000;
                            // Send Token Killed Event
                            let event = {
                                type: 'room_including_me',
                                room: params.room,
                                delay: 1700,
                                name: 'token_killed',
                                data: {
                                    room: params.room,
                                    dead_tokens: canIKill,
                                    kill_anim_timer: config.pawnMoveTimer
                                },
                            };
                            // add extra propery for Kill animation.
                            resObj.callback.isKillable = true;                            
                            for (let index = 0; index < resObj.events.length; index++) {
                                if(resObj.events[index].name == 'move_made'){
                                    resObj.events[index].data.isKillable = true;
                                }
                            }

                            resObj.events.push(event);

                            /**
                             * Bug NO: 39
                             * If a cut/home happens with a six, then only one extra move should be given
                             */

                            // If cut/home happen with 6, then only one extra move given. not two
                            if (params.dice_value == 6)
                            {
                               // If kill happans with six, then extra_roll_reason should be Kill.
                               if(gamePlayData.data.extra_roll_reason.includes("six")) 
                               {
                                    gamePlayData.data.extra_roll_reason.map((ele,index) => {
                                        if(ele == 'six'){
                                            gamePlayData.data.extra_roll_reason.splice(index,1);
                                        }
                                    });
                                }

                                moveBonusCheck = true;
                                killed = true;
                                await _tab.addBonus(params.room, id, 0, "Kill", myRoom, gamePlayData);
                                await _tab.addBonusPoints(params.room, id, 20, canIKill.length, 'cut_bonus', myRoom, gamePlayData)
                                console.log('after cut ------>', myRoom);
                            } else
                            {
                                // Add Bonus as much as Killed Token Length
                                let sixCounts = _tab.setSix(params.room, id, myRoom);
                                // bugNo: 79 user should no offer more then two dice roll
                                if (canIKill.length >= 1)
                                {
                                    await _tab.addBonus(params.room, id, 1, "Kill", myRoom, gamePlayData);
                                }
                                // _tab.addBonus(params.room, id, canIKill.length, "Kill");                            
                                await _tab.addBonusPoints(params.room, id, 20, canIKill.length, 'cut_bonus',myRoom, gamePlayData)
                                console.log('after cut ------>', myRoom);
                                moveBonusCheck = true;
                                killed = true;
                            }
                        }
                        // Else [!canIKill]
                        else
                        {
                            moveBonusCheck = true;
                        }
                    } catch (error)
                    {
                        console.lof("CATCH ERROR _ ", error)
                    }

                }

                // console.log('BONUS', moveBonusCheck);
                // IF moveBonusCheck
                if (moveBonusCheck)
                {
                    let movePossible = await _tab.isMovePossible(params.room, id, myRoom);
                    console.log('movePossible >>', movePossible);

                    let timer = 1500; //1500;
                    if (killed) timer = killTimer;//4000 //nostra 3000

                    // If Move Possible
                    if (movePossible)
                    {
                        //  MAKE_MOVE TO ME
                        console.log('update turn 10');
                        await _tab.updateCurrentTurn(params.room, myPos, 'move', -1, 0,myRoom);
                        setTimeout(function ()
                        {
                            _tab.updateCurrentTime(params.room, myRoom); /// to solve early leave deduction on token kill
                        }, timer)

                        let dices_rolled = await _tab.gePlayerDices(params.room, myPos, myRoom, gamePlayData);
                        let event = {
                            type: 'room_including_me',
                            room: params.room,
                            delay: timer,
                            name: 'make_move',
                            data: {
                                room: params.room,
                                position: myPos,
                                dices_rolled: dices_rolled,
                                turn_start_at: config.turnTimer,
                                turn_timestamp : myRoom.turn_timestamp,
                                server_time : new Date(),
                            },
                        };
                        resObj.events.push(event);
                    }
                    // Else [!movePossible]
                    else
                    {
                        console.log("in the SCRAP TURNB");
                        // scrapTurn
                        // let sixCounts = await _tab.setSix(params.room, id);
                        // console.log("set six...3")
                        _tab.scrapTurn(params.room, myPos, myRoom);

                        // Check If Bonus Pending
                        let pendingBonus = await _tab.getBonus(params.room, id, myRoom);
                        console.log('GET BONUS', pendingBonus);
                        if (pendingBonus > 0)
                        {
                            console.log("in the SCRAP TURNB 11");
                            // Deduct Bonus
                            await _tab.useBonus(params.room, id, myRoom);
                            // Send 'roll' to same player
                            console.log('update turn 11');
                            await _tab.updateCurrentTurn(params.room, myPos, 'roll', -1, 0,myRoom);
                            setTimeout(function ()
                            {
                                _tab.updateCurrentTime(params.room, myRoom); /// to solve early leave deduction on token kill
                            }, timer)
                            let dices_rolled = await _tab.gePlayerDices(params.room, myPos, myRoom, gamePlayData);
                            // let DICE_ROLLED = _tab.rollDice(params.room, id);
                            let DICE_ROLLED = Math.floor(Math.random() * 6) + 1;
                            await _tab.diceRolled(params.room, myPos, DICE_ROLLED, myRoom, gamePlayData);
                            // SEND EVENT
                            let event = {
                                type: 'room_including_me',
                                room: params.room,
                                delay: timer,
                                name: 'make_diceroll',
                                data: {
                                    room: params.room,
                                    position: myPos,
                                    tokens: await _tab.getTokens(params.room, myRoom),
                                    dice: DICE_ROLLED,
                                    dices_rolled: dices_rolled,
                                    turn_start_at: config.turnTimer,
                                    extra_move_animation: true,
                                    turn_timestamp : myRoom.turn_timestamp,
                                    server_time : new Date(),
                                },
                            };
                            resObj.events.push(event);
                        }
                        // Else [!BonusPending]
                        else
                        {
                            // If no pending dice roll then reset the six counter.
                            await _tab.setSix(params.room, id, myRoom);
                            await  _tab.scrapTurn(params.room, myPos, myRoom);
                            let nextPos = await _tab.getNextPosition(params.room, myPos, myRoom);
                            console.log('update turn 12');
                            await _tab.updateCurrentTurn(params.room, nextPos, 'roll', myPos, 0,myRoom);
                            let dices_rolled = await _tab.gePlayerDices(params.room, nextPos, myRoom, gamePlayData);
                            // let DICE_ROLLED = await _tab.rollDice(params.room, id);
                            let DICE_ROLLED_RES = await _tab.rollDice(params.room, id, myRoom);
                            let DICE_ROLLED;
                            if(DICE_ROLLED_RES) {
                                myRoom = DICE_ROLLED_RES.table;
                                DICE_ROLLED = DICE_ROLLED_RES.returnDiceValue;
                            }
                            await _tab.diceRolled(params.room, nextPos, DICE_ROLLED, myRoom, gamePlayData);
                            // Update player_score and player_points in gamePlayData
                            // SEND EVENT
                            let user_points = 0;
                            gamePlayData.data.points_per_diceRoll.map(function(ele) {
                                user_points += ele;
                            });
                            gamePlayData.data.points = user_points + (+gamePlayData.data.total_move);                           
                            gamePlayData.data.player_score = myRoom.users[myPos].points + myRoom.users[myPos].bonusPoints;
                            await _tab.sendToSqsAndResetGamePlayData(params.room, myRoom, gamePlayData, myPos);
                            
                            // SEND EVENT
                            let event = {
                                type: 'room_including_me',
                                room: params.room,
                                delay: timer,
                                name: 'make_diceroll',
                                data: {
                                    room: params.room,
                                    position: nextPos,
                                    tokens: await _tab.getTokens(params.room, myRoom),
                                    dice: DICE_ROLLED,
                                    dices_rolled: dices_rolled,
                                    turn_start_at: config.turnTimer,
                                    extra_move_animation: false,
                                    turn_timestamp : myRoom.turn_timestamp,
                                    server_time : new Date(),
                                },
                            };
                            resObj.events.push(event);
                        }
                    }
                }
            }
            let event = {
                type: 'room_including_me',
                room: params.room,
                name: 'score_updated',
                delay: 1500,
                data: {
                    room: params.room,
                    score_data: _tab.getPoints(params.room, myRoom),
                },
            };
            resObj.events.push(event);
            // console.trace('[MOVE_MADE]', JSON.stringify(resObj));
            return resObj;
        } catch (err)
        {
            console.log('ERROR', err);
        }
    },
    checkwinnerOfTournament: async function (room,myRoom)
    {
        let tableD = await Table.findOne({
            room: room,
        });
        if (tableD)
        {
            console.log('AMount>>>', tableD.win_amount);
            winnerRes = await _tab.EndOfTournamentV2(tableD.room, tableD.win_amount,myRoom);
            myRoom = winnerRes.table;
            let winnerInfo = winnerRes.winner;
            if (winnerInfo)
            {   
                // in redis updated isGameCompleted property
                myRoom.isGameCompleted = true;
                await redisCache.addToRedis(room, myRoom);
                for (let j = 0; j < winnerInfo.length; j++)
                {
                    for (let k = 0; k < tableD.players.length; k++)
                    {
                        if (winnerInfo[j].id.toString() == tableD.players[k].id.toString())
                        {
                            tableD.players[k].rank = winnerInfo[j].rank;
                            tableD.players[k].pl += winnerInfo[j].amount;
                            console.log('EG >1> ', winnerInfo[j].amount);
                        }
                    }
                }
                tableD.game_completed_at = new Date().getTime();
                tableD.isGameCompleted   = true;
                tableD
                    .save()
                    .then((d) =>
                    {
                        console.log(d);
                    })
                    .catch((e) =>
                    {
                        console.log('Error::', e);
                    });

                // Update values in user wallets & table data [DB]
                let event = {
                    type: 'room_including_me',
                    room: room,
                    delay: 2000,
                    name: 'end_game',
                    data: {
                        room: room,
                        game_data: winnerInfo,
                    },
                };
                let reqData = await this.getEndGameData(event.data, myRoom.room_fee);
                console.log("END-GAME-DATA-2", reqData);
                let startGame = await requestTemplate.post(`endgame`, reqData);
                // if (!startGame.isSuccess)
                // {
                //     return {callback: {status: 0, message: startGame.error}};
                // }
                //return event;
                let resObj = {
                    'events' : [],
                    'table' : myRoom
                };

                resObj.events.push(event);
                return resObj;
            }
            // if (timeInsecond < 0) timeInsecond = 0;
            // return ({time: config.gameTime * 60 - timeInsecond});
            // resObj.events.push(event);      
        }
    },
    // Quit Game / Leave Table
    leaveTable: async function (params, id, socket, myRoom, gamePlayData)
    {
        // To set game time in leave table 
        gamePlayData.data.game_time = await _tab.setGameTime(myRoom);
        let refund = '';
        if (!Service.validateObjectId(id))
            return {
                callback: {
                    status: 0,
                    message: localization.missingParamError,
                    refund: refund
                },
            };

        var us = await User.findById(id);
        if (!params || !us)
            return {
                callback: {
                    status: 0,
                    message: localization.missingParamError,
                    refund: refund
                },
            };

        if (!params.room)
            return {
                callback: {
                    status: 0,
                    message: localization.missingParamError,
                    refund: refund
                },
            };

        var tableD = await Table.findOne({
            room: params.room,
        });
        if (!tableD)
            return {
                callback: {
                    status: 0,
                    message: localization.tableDoesNotExist,
                    refund: refund
                },
            };
       
        var rez = await _tab.leave(params.room, id, myRoom);
        console.log('LEAVE RES', rez); //2|socket  | [2022-04-13T11:01:02.572] [INFO] default - LEAVE RES { res: false, flag: 1, remove: true }

        if (!rez.res && rez.flag == 1)
        {
            // console.log('User Left Before Game Start');

            await Table.findByIdAndUpdate(tableD._id, {
                $pull: {
                    players: {
                        id: ObjectId(id),
                    },
                },
            });
        }
        else
        {
            let playerIndex = 0;
            for (let k = 0; k < tableD.players.length; k++)
            {
                if (id.toString() == tableD.players[k].id.toString())
                {
                    playerIndex = k;
                }
            }
            await Table.update({
                "_id": tableD._id,
                "players.id": id
            },
                {
                    "$set": {
                        "players.$.is_active": false
                    }
                },
                {
                    "new": true
                })
        }

        if (params && params.gameNotStarted && params.gameNotStarted == 'true')
        {
            // this.refundMoney(tableD,id);
            refund = localization.insufficientPlayer;
            // remove room from redis cache after player refunded & match unsucessfull.
            await redisCache.removeDataFromRedis(params.room);
            await redisCache.removeDataFromRedis('room_'+params.room);
            await redisCache.removeDataFromRedis('gamePlay_'+params.room);
        }
        let reqData = {
            room: params.room,
            amount: tableD.room_fee.toString(),
            users: [{
                "user_id": us.numeric_id,
                "token": us.token,
                "isRefund": params.isRefund ? params.isRefund : false
            }]
        }
        //Bug_no: 79 comment this line for testing.
        await requestTemplate.post(`matchmakingFailed`, reqData);
        console.log('BEFORE API calling :: ', rez);
        if (!rez.res)
        {
            return {
                callback: {
                    status: 1,
                    header : refund != '' ? "Opponent Not Found" : "Server Error",
                    message: refund != '' ? refund : localization.ServerError,
                    refund: refund
                },
                events: [
                    {
                        type: 'users_including_me',
                        room: params.room,
                        name: 'leaveTable',
                        users: [id],
                        data: {
                            room: params.room,
                            status: 0,
                            header : refund != '' ? "Opponent Not Found" : "Server Error",
                            message: refund != '' ? refund : localization.ServerError,
                            refund: refund
                        },
                    },
                ],
            };
        } else
        {
            const userData = [];
            myRoom.users.map((cur) => {
                userData.push({
                    "player_index":cur.position,
                    "numeric_id":cur.numeric_id,
                    "token":cur.user_token,
                    "id":cur.id,
                    "name":cur.name,
                    "rank":0,
                    "amount":0,
                    "is_left": cur.hasOwnProperty('is_left') ? cur.is_left : false,
                    "score":0
                });
            },[])

            var rez_finalObj = {
                callback: {
                    status: 1,
                    message: localization.success,
                    refund: refund
                },
                events: [
                    {
                        type: 'room_excluding_me',
                        room: params.room,
                        name: 'playerLeft',
                        data: {
                            room: params.room,
                            position: rez.position,
                            game_data: userData
                        },
                    },
                ],
            };

            var checkOnlyPlayerLeftRes = _tab.checkOnlyPlayerLeft(params.room, myRoom);
            let checkOnlyPlayerLeft;
            if (checkOnlyPlayerLeftRes) {
                myRoom = checkOnlyPlayerLeftRes.table;
                checkOnlyPlayerLeft = checkOnlyPlayerLeftRes.response;
            }           

            console.log("checkOnlyPlayerLeft - ", checkOnlyPlayerLeft)
            // CheckIfOnlyPlayerLeft
            if (checkOnlyPlayerLeft)
            {
                // Check if EndGame Possible
                let tableD = await Table.findOne({
                    room: params.room,
                });
                var endGameRes = await _tab.calculateGameEndData(params.room, myRoom.win_amount, myRoom);
                let endGame;
                if(endGameRes) {
                    myRoom = endGameRes.table;
                    endGame = endGameRes.rank;
                }
                if (endGame)
                {
                    // Update values in user wallets & table data [DB]                 
                    // console.log('tableD::', tableD);

                    if (tableD)
                    {
                        // in redis updated isGameCompleted property
                        myRoom.isGameCompleted = true;
                        await redisCache.addToRedis(params.room, myRoom);
                        for (let j = 0; j < endGame.length; j++)
                        {
                            for (let k = 0; k < tableD.players.length; k++)
                            {
                                if (endGame[j].id.toString() == tableD.players[k].id.toString())
                                {
                                    tableD.players[k].rank = endGame[j].rank;
                                    tableD.players[k].pl += endGame[j].amount;
                                }
                            }
                        }

                        tableD.game_completed_at = new Date().getTime();
                        tableD.isGameCompleted   = true;
                        tableD
                            .save()
                            .then((d) =>
                            {
                                // console.log(d);
                            })
                            .catch((e) =>
                            {
                                // console.log('Error::', e);
                            });
                    }

                    // Update values in user wallets & table data [DB]
                    let event = {
                        type: 'room_including_me',
                        room: params.room,
                        delay: 2000,
                        name: 'end_game',
                        data: {
                            room: params.room,
                            game_data: endGame,
                        },
                    };
                    rez_finalObj.events.push(event);
                    let reqData = await this.getEndGameData(event.data, myRoom.room_fee);
                    console.log("END-GAME-DATA-3", reqData);
                    let startGame = await requestTemplate.post(`endgame`, reqData)
                    // if (!startGame.isSuccess)
                    // {
                    //     return {callback: {status: 0, message: startGame.error}};
                    // }
                }
                // Else [!endGame]
                else
                {
                    let myPos = await _tab.getMyPosition(params.room, id, myRoom);
                    //  SCRAP CURRENT DICES & PASS NEXT DICE_ROLL
                    await _tab.scrapTurn(params.room, myPos, myRoom);
                    // DICE_ROLL TO NEXT
                    let nextPos = await _tab.getNextPosition(params.room, myPos, myRoom);
                    console.log('update turn 13');
                    await _tab.updateCurrentTurn(params.room, nextPos, 'roll', myPos, 0,myRoom);
                    let dices_rolled = await _tab.gePlayerDices(params.room, nextPos, myRoom, gamePlayData);
                    // let DICE_ROLLED = await _tab.rollDice(params.room, id);
                    let DICE_ROLLED_RES = await _tab.rollDice(params.room, id, myRoom);
                    let DICE_ROLLED;
                    if(DICE_ROLLED_RES) {
                        myRoom = DICE_ROLLED_RES.table;
                        DICE_ROLLED = DICE_ROLLED_RES.returnDiceValue;
                    }
                    await _tab.diceRolled(params.room, nextPos, DICE_ROLLED, myRoom, gamePlayData);

                    await _tab.sendToSqsAndResetGamePlayData(params.room, myRoom, gamePlayData, myPos);
                    // SEND EVENT
                    let event = {
                        type: 'room_including_me',
                        room: params.room,
                        delay: 1500,
                        name: 'make_diceroll',
                        data: {
                            room: params.room,
                            position: nextPos,
                            tokens: _tab.getToken,
                            dices_rolled: dices_rolled,
                            dice: DICE_ROLLED,
                            turn_start_at: config.turnTimer,
                            extra_move_animation: false,
                            turn_timestamp : myRoom.turn_timestamp,
                            server_time : new Date(),
                        },
                    };
                    rez_finalObj.events.push(event);
                }
            } else
            {
                let mypos = await _tab.getMyPosition(params.room, id, myRoom);
                console.log('My position::', mypos);

                if (mypos != -1)
                {
                    let check = await _tab.isCurrentTurnMine(params.room, mypos, myRoom);
                    if (check)
                    {
                        //  SCRAP CURRENT DICES & PASS NEXT DICE_ROLL
                        console.log('SCRAP CURRENT DICES ROOM: ' + JSON.stringify(myRoom));
                        await _tab.scrapTurn(params.room, mypos, myRoom);
                        // nextPosition find & add event dice_roll
                        console.log('SCRAP CURRENT DICES ROOM1: ' + JSON.stringify(myRoom));
                        let nextPos = await _tab.getNextPosition(params.room, mypos, myRoom);
                        console.log('update turn 14');
                        console.log('SCRAP CURRENT DICES ROOM2: ' + JSON.stringify(myRoom));
                       
                        await _tab.updateCurrentTurn(params.room, nextPos, 'roll', mypos, 0,myRoom);
                        console.log('11111');
                        let dices_rolled = await _tab.gePlayerDices(params.room, nextPos, myRoom, gamePlayData);
                        // let DICE_ROLLED = await _tab.rollDice(params.room, id);
                        console.log('22222');
                        let DICE_ROLLED_RES = await _tab.rollDice(params.room, id, myRoom);
                        console.log('33333');
                        let DICE_ROLLED;
                        if(DICE_ROLLED_RES) {
                            myRoom = DICE_ROLLED_RES.table;
                            DICE_ROLLED = DICE_ROLLED_RES.returnDiceValue;
                        }
                        console.log('444444');
                        await _tab.diceRolled(params.room, nextPos, DICE_ROLLED, myRoom, gamePlayData);
                        console.log('55555');
                        await _tab.sendToSqsAndResetGamePlayData(params.room, myRoom, gamePlayData, mypos);
                    
                        
                        console.log('66666');
                        let event = {
                            type: 'room_including_me',
                            room: params.room,
                            delay: 1500,
                            name: 'make_diceroll',
                            data: {
                                room: params.room,
                                position: nextPos,
                                tokens: await _tab.getTokens(params.room, myRoom),
                                dice: DICE_ROLLED,
                                dices_rolled: dices_rolled,
                                turn_start_at: config.turnTimer,
                                extra_move_animation: false,
                                turn_timestamp : myRoom.turn_timestamp,
                                server_time : new Date(),
                            },
                        };

                        rez_finalObj.events.push(event);
                    }
                }
            }

            return rez_finalObj;
        }
    },

    //Skip Turn
    skipTurn: async function (params, id, myRoom, gamePlayData)
    {
        console.log('Skip Turn Request', params);
        if (!params || !params.room)
        {
            return {
                callback: {
                    status: 0,
                    message: localization.missingParamError,
                    'table' : myRoom,
                    'gamePlayData' : gamePlayData
                },
            };
        }
        var mypos = await _tab.getMyPosition(params.room, id, myRoom);
        // console.log('My position::', mypos);
        gamePlayData.data.game_time = await _tab.setGameTime(myRoom);
        if (mypos != -1)
        {
            var check = await _tab.isCurrentTurnMine(params.room, mypos, myRoom);

            if (check)
            {
                let deductRes = await _tab.deductLife(params.room, id, myRoom, gamePlayData);
                myRoom = deductRes.table;
                gamePlayData = deductRes.gameData;
                var checkLife = await _tab.getMyLife(params.room, id, myRoom);

                // console.log('Current Life::', checkLife);

                if (checkLife == 0)
                {
                    //leave table and pass turn to next player
                    var rez = await _tab.leave(params.room, id, myRoom);
                    // console.log('REZ', rez);
                    if (!rez.res)
                    {
                        return {
                            callback: {
                                status: 0,
                                message: localization.ServerError,
                            },
                            'table' : myRoom,
                            'gamePlayData' : gamePlayData
                        };
                    } else
                    {
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

                        var rez_finalObj = {
                            callback: {
                                status: 2,
                                message: localization.success,
                            },
                            'table' : myRoom,
                            'gamePlayData' : gamePlayData,
                            events: [
                                {
                                    type: 'room_including_me',
                                    room: params.room,
                                    name: 'life_deduct',
                                    data: {
                                        room: params.room,
                                        position: rez.position,
                                    }
                                },
                                {
                                    type: 'room_including_me',
                                    room: params.room,
                                    name: 'playerLeft',
                                    delay: 500, //1500
                                    data: {
                                        room: params.room,
                                        position: rez.position,
                                        game_data : userData
                                    },
                                },
                            ],
                        };

                        var checkOnlyPlayerLeftRes = _tab.checkOnlyPlayerLeft(params.room, myRoom);
                        let checkOnlyPlayerLeft;
                        if (checkOnlyPlayerLeftRes) {
                            myRoom = checkOnlyPlayerLeftRes.table;
                            checkOnlyPlayerLeft = checkOnlyPlayerLeftRes.response;
                        }

                        // CheckIfOnlyPlayerLeft
                        // let tableD = await Table.findOne({
                        //     room: params.room,
                        // });
                        var us = await User.findById(id);
                        let reqData = {
                            room: params.room,
                            //amount: tableD.room_fee.toString(),
                            amount: myRoom.room_fee.toString(),
                            users: [{
                                "user_id": us.numeric_id,
                                "token": us.token,
                                "isRefund": params.isRefund ? params.isRefund : false
                            }]
                        }

                        await requestTemplate.post(`matchmakingFailed`, reqData)
                        if (checkOnlyPlayerLeft)
                        {
                            // Check if EndGame Possible
                            let endGameRes = await _tab.calculateGameEndData(params.room, myRoom.win_amount,myRoom);
                            let endGame;
                            if(endGameRes) {
                                myRoom = endGameRes.table;
                                endGame = endGameRes.rank;
                            }
                            if (endGame)
                            {
                                // Update values in user wallets & table data [DB]                                
                                let tableD = await Table.findOne({
                                    room: params.room,
                                  });
                                
                                if (tableD)
                                {
                                    console.log(`PL:: <<<<<<<< END GAME >>>>>>>>>`);
                                    // in redis updated isGameCompleted property
                                    myRoom.isGameCompleted = true;
                                    await redisCache.addToRedis(params.room, myRoom);
                                    endGame.map((eGame) =>
                                    {
                                        tableD.players.map((playersTable) =>
                                        {
                                            if (eGame.id.toString() == playersTable.id.toString())
                                            {
                                                playersTable.rank = eGame.rank;
                                                playersTable.pl += eGame.amount;
                                            }
                                        })
                                    })

                                    tableD.game_completed_at = new Date().getTime();
                                    tableD.isGameCompleted   = true;
                                    tableD
                                        .save()
                                        .then((d) =>
                                        {
                                            // console.log(d);
                                        })
                                        .catch((e) =>
                                        {
                                            // console.log('Error::', e);
                                        });
                                }

                                // Update values in user wallets & table data [DB]
                                let event = {
                                    type: 'room_including_me',
                                    room: params.room,
                                    delay: 2000,
                                    name: 'end_game',
                                    data: {
                                        room: params.room,
                                        game_data: endGame,
                                    },
                                };
                                rez_finalObj.events.push(event);
                                let reqData = await this.getEndGameData(event.data, myRoom.room_fee);
                                console.log("END-GAME-DATA-4", reqData);
                                let startGame = await requestTemplate.post(`endgame`, reqData)
                                // if (!startGame.isSuccess)
                                // {
                                //     return {callback: {
                                //         status: 0, 
                                //         message: startGame.error
                                //     },
                                //     'table' : myRoom,
                                //     'gamePlayData' : gamePlayData
                                // };
                                // }
                                await _tab.sendToSqsAndResetGamePlayData(params.room, myRoom, gamePlayData, mypos);
                            }
                            // Else [!endGame]
                            else
                            {
                                let myPos = await _tab.getMyPosition(params.room, id, myRoom);
                                //  SCRAP CURRENT DICES & PASS NEXT DICE_ROLL
                                await _tab.scrapTurn(params.room, myPos, myRoom);
                                // DICE_ROLL TO NEXT
                                let nextPos = await _tab.getNextPosition(params.room, myPos, myRoom);
                                console.log('update turn 15');
                                await _tab.updateCurrentTurn(params.room, nextPos, 'roll', myPos, 0,myRoom);
                                let dices_rolled = await _tab.gePlayerDices(params.room, nextPos, myRoom, gamePlayData);
                                // let DICE_ROLLED = await _tab.rollDice(params.room, id);
                                let DICE_ROLLED_RES = await _tab.rollDice(params.room, id, myRoom);
                                let DICE_ROLLED;
                                if(DICE_ROLLED_RES) {
                                    myRoom = DICE_ROLLED_RES.table;
                                    DICE_ROLLED = DICE_ROLLED_RES.returnDiceValue;
                                }
                                await _tab.diceRolled(params.room, nextPos, DICE_ROLLED, myRoom, gamePlayData);
                                await _tab.sendToSqsAndResetGamePlayData(params.room, myRoom, gamePlayData, myPos);

                                // SEND EVENT
                                let event = {
                                    type: 'room_including_me',
                                    room: params.room,
                                    delay: 1500, //1500
                                    name: 'make_diceroll',
                                    data: {
                                        room: params.room,
                                        position: nextPos,
                                        tokens: await _tab.getTokens(params.room, myRoom),
                                        dice: DICE_ROLLED,
                                        dices_rolled: dices_rolled,
                                        turn_start_at: config.turnTimer,
                                        extra_move_animation: false,
                                        turn_timestamp : myRoom.turn_timestamp,
                                        server_time : new Date(),
                                    },
                                };
                                rez_finalObj.events.push(event);
                            }
                        } else
                        {
                            let mypos = await _tab.getMyPosition(params.room, id, myRoom);
                            // console.log('My position::', mypos);

                            if (mypos != -1)
                            {
                                let check = await _tab.isCurrentTurnMine(params.room, mypos, myRoom);
                                if (check)
                                {
                                    //  SCRAP CURRENT DICES & PASS NEXT DICE_ROLL
                                    await _tab.scrapTurn(params.room, mypos, myRoom);
                                    // nextPosition find & add event dice_roll
                                    let nextPos = await _tab.getNextPosition(params.room, mypos, myRoom);
                                    console.log('update turn 16');
                                    await _tab.updateCurrentTurn(params.room, nextPos, 'roll', mypos, 0,myRoom);
                                    let dices_rolled = await _tab.gePlayerDices(params.room, nextPos, myRoom, gamePlayData);
                                    // let DICE_ROLLED = await _tab.rollDice(params.room, id);
                                    let DICE_ROLLED_RES = await _tab.rollDice(params.room, id, myRoom);
                                    let DICE_ROLLED;
                                    if(DICE_ROLLED_RES) {
                                        myRoom = DICE_ROLLED_RES.table;
                                        DICE_ROLLED = DICE_ROLLED_RES.returnDiceValue;
                                    }
                                    await _tab.diceRolled(params.room, nextPos, DICE_ROLLED, myRoom, gamePlayData);
                                    await _tab.sendToSqsAndResetGamePlayData(params.room, myRoom, gamePlayData, mypos);

                                    let event = {
                                        type: 'room_including_me',
                                        room: params.room,
                                        delay: 500, //1500
                                        name: 'make_diceroll',
                                        data: {
                                            room: params.room,
                                            position: nextPos,
                                            tokens: await _tab.getTokens(params.room, myRoom),
                                            dice: DICE_ROLLED,
                                            dices_rolled: dices_rolled,
                                            turn_start_at: config.turnTimer,
                                            extra_move_animation: false,
                                            turn_timestamp : myRoom.turn_timestamp,
                                            server_time : new Date(),
                                        },
                                    };

                                    rez_finalObj.events.push(event);
                                }
                            }
                        }
                        rez_finalObj.table=myRoom;
                        rez.gamePlayData=gamePlayData;
                        return rez_finalObj;
                    }
                } else
                {
                    var resObj = {
                        callback: {
                            status: 1,
                            message: localization.success,
                        },
                        'table' : myRoom,
                        'gamePlayData' : gamePlayData,
                        events: [],
                    };

                    // _tab.deductLife(params.room, id);
                    var life_event = {
                        type: 'room_including_me',
                        room: params.room,
                        name: 'life_deduct',
                        data: {
                            room: params.room,
                            position: mypos,
                        },
                    };
                    resObj.events.push(life_event);

                    //  SCRAP CURRENT DICES & PASS NEXT DICE_ROLL
                    await _tab.scrapTurn(params.room, mypos, myRoom);
                    let pendingBonus = await _tab.getBonus(params.room, id, myRoom);
                    console.log('GET BONUS', pendingBonus);
                    if (pendingBonus > 0)
                    {
                        console.log("in the SCRAP TURNB 11");
                        // Deduct Bonus
                        await _tab.useBonus(params.room, id, myRoom);
                        // Send 'roll' to same player
                        console.log('update turn 17');
                        await _tab.updateCurrentTurn(params.room, mypos, 'roll', -1, 0,myRoom);
                        let dices_rolled = await _tab.gePlayerDices(params.room, mypos, myRoom, gamePlayData);
                        // let DICE_ROLLED = _tab.rollDice(params.room, id);
                        let DICE_ROLLED = Math.floor(Math.random() * 6) + 1;
                        await _tab.diceRolled(params.room, mypos, DICE_ROLLED, myRoom, gamePlayData);
                        // SEND EVENT
                        let event = {
                            type: 'room_including_me',
                            room: params.room,
                            delay: 1500,
                            name: 'make_diceroll',
                            data: {
                                room: params.room,
                                position: mypos,
                                tokens: await _tab.getTokens(params.room, myRoom),
                                dice: DICE_ROLLED,
                                dices_rolled: dices_rolled,
                                turn_start_at: config.turnTimer,
                                extra_move_animation: true,
                                turn_timestamp : myRoom.turn_timestamp,
                                server_time : new Date(),
                            },
                        };
                        resObj.events.push(event);

                    }
                    // Else [!BonusPending]
                    else
                    {
                        // nextPosition find & add event dice_roll
                        let nextPos = await _tab.getNextPosition(params.room, mypos, myRoom);
                        console.log('update turn 18');
                        await _tab.updateCurrentTurn(params.room, nextPos, 'roll', mypos, 0,myRoom);
                        console.log("gamePlayData before 1: " + JSON.stringify(gamePlayData));
                        let dices_rolled = await _tab.gePlayerDices(params.room, nextPos, myRoom, gamePlayData);
                        // let DICE_ROLLED = await _tab.rollDice(params.room, id);

                        console.log("gamePlayData before 2: " + JSON.stringify(gamePlayData));
                        let DICE_ROLLED_RES = await _tab.rollDice(params.room, id, myRoom);
                        let DICE_ROLLED;
                        if(DICE_ROLLED_RES) {
                            myRoom = DICE_ROLLED_RES.table;
                            DICE_ROLLED = DICE_ROLLED_RES.returnDiceValue;
                        }
                        await _tab.diceRolled(params.room, nextPos, DICE_ROLLED, myRoom, gamePlayData);
                        console.log("gamePlayData before 3: " + JSON.stringify(gamePlayData));
                        await _tab.sendToSqsAndResetGamePlayData(params.room, myRoom, gamePlayData, mypos);
                        console.log("gamePlayData before 4: " + JSON.stringify(gamePlayData));
                        let event = {
                            type: 'room_including_me',
                            room: params.room,
                            delay: 1500,//1500,
                            name: 'make_diceroll',
                            data: {
                                room: params.room,
                                position: nextPos,
                                tokens: await _tab.getTokens(params.room, myRoom),
                                dice: DICE_ROLLED,
                                dices_rolled: dices_rolled,
                                turn_start_at: config.turnTimer,
                                extra_move_animation: false,
                                turn_timestamp : myRoom.turn_timestamp,
                                server_time : new Date(),
                            },
                        };

                        resObj.events.push(event);
                    }
                    resObj.table=myRoom;
                    resObj.gamePlayData=gamePlayData;
                    return resObj;
                }
            } else
            {
                return {
                    callback: {
                        status: 0,
                        message: localization.NotYourMoveError,
                    },
                    'table' : myRoom,
                    'gamePlayData' : gamePlayData
                };
            }
        } else
        {
            return {
                callback: {
                    status: 0,
                    message: localization.ServerError,
                },
                'table' : myRoom,
                'gamePlayData' : gamePlayData
            };
        }
    },


    // checkLeaveTable: async function (id)
    // {
    //     // console.log('check leave teable');
    //     let leaveIfPlaying = await _tab.leaveIfPlaying(id);

    //     if (leaveIfPlaying)
    //     {
    //         var rez = _tab.leaveIf(leaveIfPlaying, id);
    //         // console.log('REZ', rez);

    //         if (!rez.res && rez.flag == 1)
    //         {
    //             // console.log('User Left Before Game Start');
    //             let getTable = await Table.findOne({
    //                 room: leaveIfPlaying,
    //             });

    //             await Table.findByIdAndUpdate(getTable._id, {
    //                 $pull: {
    //                     players: {
    //                         id: ObjectId(id),
    //                     },
    //                 },
    //             });
    //         }
    //         return true;
    //     } else
    //     {
    //         return {
    //             callback: {
    //                 status: 0,
    //                 message: localization.tableDoesNotExist,
    //             },
    //         };
    //     }
    // },

    startIfPossibleTournament: async function (params, myRoom, gamePlayData)
    {
        // console.log('StartIfPossible request IN', params);

        if (!params) return false;

        if (!params.room) return false;

        let start = await _tab.tournamentStartGame(params.room, myRoom, gamePlayData);
        // console.log('AFTER START ==>');

        let tableD = await Table.findOne({room: params.room});
        if (tableD)
        {
            //var dt = new Date();
            //dt.setSeconds( dt.getSeconds() + 7);
            // tableD.game_started_at = new Date(dt).getTime();
            // tableD.turn_start_at = new Date(dt).getTime();
           // dt.setSeconds(dt.getSeconds() + 1);

           // if game start & move happend at tie time then
            let currentData = new Date();
            currentData.setSeconds(currentData.getSeconds()-1);
            let time = new Date(currentData).getTime();

            tableD.game_started_at = new Date().getTime();
            tableD.turn_start_at = new Date().getTime();
            myRoom.game_started_at = time;
            await tableD.save();
            console.log("startIfPossibleTournament Start Time- ", new Date(tableD.game_started_at), tableD.game_started_at)
            let timeToAdd = new Date(new Date().getTime() + config.gameTime * 60000);
            var seconds = (timeToAdd - new Date().getTime()) / 1000;
            console.log(timeToAdd, new Date().getTime(), seconds)
            // start.timeToCompleteGame = seconds;
            start.timeToCompleteGame = config.gameTime * 60;
        }
        if(start && start.table && start.table.users && start.table.users.length > 0)
        {
            start.table.users.forEach(element => {
                element.diceValue=[];
            });
        }
        return start;
    },


    abortGame: async function (table)
    {
        let nw = await Table.findOneAndUpdate(
            {
                room: table.room,
            },
            {
                $set: {
                    game_completed_at: new Date().getTime(),
                    players: [],
                },
            },
            {
                new: true,
            }
        );

        console.log('NW DONE', nw);

        await _tab.abortGame(table.room);
    },

    //Check Tabel Exists
    istableExists: async function (params,myRoom)
    {
        // console.log('Check Tabel Exists Request >> ', params);
        if (!params)
        {
            // console.log('missingParamError');
            return false;
        }
        if (!params.room)
        {
            // console.log('missingParamError');
            return false;
        }
        // let myRoom     = await redisCache.getRecordsByKeyRedis(params.room);
        let tabelCheck = _tab.checkTableExists(params.room, myRoom);
        // console.log('Table Exists', tabelCheck);
        return tabelCheck;
    },

    getMyIdByPossition: async function (params, id, myRoom)
    {
        // console.log('Request to get ID >>', params);
        if (!params)
        {
            // console.log('missingParamError');
            return false;
        }
        if (!params.room)
        {
            // console.log('missingParamError');
            return false;
        }

        return await _tab.getMyIdByPosition(params.room, id, myRoom);

    },

    reconnectIfPlaying: async function (id) 
    {
        console.log('User Playing On Table');
        //if (!Service.validateObjectId(id)) false;
        let us = await User.findById(id);
        console.log('USERS DETAILS BY ID', us);
        let roomId = await redisCache.getRecordsByKeyRedis('user_id'+id.toString());
        let myRoom;
        if(roomId) {
            myRoom = await redisCache.getRecordsByKeyRedis(roomId);
        }
        if(myRoom) {
            let alreadyPlaying = _tab.alreadyPlayingTable(us._id,myRoom);
            if (alreadyPlaying.status == 1)
            {
                var tab = await Table.findOne({room: alreadyPlaying.table.room, 'players.id': id});
                if (!tab)
                {
                    // FIX_2407 : ALREADY PLAYING
                    console.log('DESTROY', alreadyPlaying.table.room);
                    await _tab.abortGame(alreadyPlaying.table.room);
                    return {
                        status: 0,
                    };
                } else
                {
                    console.log(tab)
                    alreadyPlaying.status = 1;
                    return alreadyPlaying;
                }
            }
            else 
            {
                return alreadyPlaying;
            }
       } else {
            return {
                status: 0,
                message: "An error was encountered. Please join a new game."
            }
       }
    },

    getTokens: async function (room, id, myRoom)
    {
        if (!Service.validateObjectId(id)) false;
        let us = await User.findById(id);

        let alreadyPlaying = _tab.getTokRoom(room, us._id, myRoom);

        // console.log('User Playing On Table', alreadyPlaying);
        return alreadyPlaying;
    },   

     sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),

     joinTournamentV2: async function (params, entry_Fee, myId, user, retryCount = 0) {
        params = _.pick(params, ['no_of_players', 'room_fee', 'winningAmount', 'totalWinning', 'lobbyId']);
        if (!params || !Service.validateObjectId(myId) || _.isEmpty(params.no_of_players) || _.isEmpty(params.room_fee)) {
            return {
                callback: {
                    status: 0,
                    message: localization.invalidRequestParams,
                },
            };
        }

        //check valid user and valid no of user
        if (!user || !config.noOfPlayersInTournament.includes(parseInt(params.no_of_players))) {
            return {
                callback: {
                    status: 0,
                    message: localization.ServerError,
                },
            };
        }

        // var tableD = await Table.findOne({
        //     'room_fee': params.room_fee,
        //     'players.id': ObjectId(myId),
        //     "game_completed_at": "-1"
        // });

        let lobbyAlreadyReceived = await redisCache.incrFromRedis('lobbyIdAtom_'+params.lobbyId);

        let roomId = await redisCache.getRecordsByKeyRedis('lobbyId_'+params.lobbyId);
        let myRoom;
        let tableD;
        if(!roomId && lobbyAlreadyReceived>1)
        {
            console.log("race condition triggered for lobby: "+params.lobbyId);
            for(i=0;i<10;i++)
            {
                console.log("race condition triggered for value: " + i );
                await this.sleep(1000 * 1);
                roomId = await redisCache.getRecordsByKeyRedis('lobbyId_'+params.lobbyId);
                if(roomId)
                   break;
            } 
        }
        if(roomId) {
            myRoom = await redisCache.getRecordsByKeyRedis(roomId);
        }
        if(roomId){
         tableD = await Table.findOne({
            'lobbyId': params.lobbyId,
            'room':roomId
        });
            }
            else
            {
                 tableD = await Table.findOne({
                    'lobbyId': params.lobbyId
                });
            }

        if (tableD) {
            let players = tableD.players;
            for (let i = 0; i < players.length; i++) {
                if (players[i].id == myId && players[i].is_active == true) {
                    return {
                        callback: {
                            status: 0,
                            message: localization.invalidRequestParams,
                        },
                    };
                }
            }
        }

        // let checkTourneyRes = await _tab.checkTournamentTable(params.room_fee, params.no_of_players);
        // let myRoom = await redisCache.getRecordsByKeyRedis(params.room);
        // let roomId = await redisCache.getRecordsByKeyRedis('lobbyId_'+params.lobbyId);
        // let myRoom;
        // if(roomId) {
        //     myRoom = await redisCache.getRecordsByKeyRedis(roomId);
        // }
        let checkTourneyRes = await _tab.checkTournamentTableV2(params.lobbyId, myRoom);
        let isAnyTableEmpty = checkTourneyRes ? checkTourneyRes.room : false;

        let secTime = config.countDownTime;
        if (params.startTime) secTime = Math.round(params.startTime / 1000) - Math.round(new Date().getTime() / 1000) + 5;
        let timerStart = secTime;
        let tableX;
        let room_code;
        if (!isAnyTableEmpty) {
            let room = await Service.randomNumber(6);
            let data;
            while (true) {
                data = await Table.find({
                    room: room,
                });

                if (data.length > 0) {
                    room = await Service.randomNumber(6);
                }
                else {
                    break;
                }
            }

            if (params) {
                params.win_amount = params.winningAmount;
                params.totalWinning = params.totalWinning;
            }
            params.room = room;
            params.created_at = new Date().getTime();
            let table = new Table(params);
            tableX = await table.save();
            if (!tableX) {
                return {
                    callback: {
                        status: 0,
                        message: localization.ServerError,
                    },
                };
            }
            room_code = await _tab.createTableforTourney(tableX, entry_Fee);
            await redisCache.addToRedis('room_'+room_code, 0);            
            console.log('room_'+room_code+' 0');           
            await redisCache.addToRedis('lobbyId_'+params.lobbyId, room_code);

            if (!room_code) {
                return {
                    callback: {
                        status: 0,
                        message: localization.ServerError,
                    },
                };
            }
        } else {
            room_code=isAnyTableEmpty;
            tableX = await Table.findOne({
                room: room_code,
            });

            if (!tableX) {
                return {
                    callback: {
                        status: 0,
                        message: localization.ServerError,
                    },
                };
            }
        }

        let valueOfRoom = await redisCache.incrFromRedis('room_'+room_code);
        console.log('room_'+room_code+' '+valueOfRoom);
        if (valueOfRoom > parseInt(params.no_of_players)) {
            // redisCache.getRecordsByKeyRedis(room_code);
            retryCount++;
            this.joinTournamentV2(params, entry_Fee, myId, user,retryCount);
        }

        myRoom = await redisCache.getRecordsByKeyRedis(room_code);
        let optional = 0;
        var seatOnTable = await _tab.seatOnTableforTourney(room_code, user, optional, myRoom);
        myRoom = seatOnTable.table;
        if (seatOnTable) {
            await redisCache.addToRedis('user_id'+myId, room_code);
            var callbackRes = {
                status: 1,
                message: 'Done',
                table: seatOnTable.table,
                position: seatOnTable.pos,
                timerStart: timerStart,
                default_diceroll_timer: config.turnTimer // bugg_no_65
            };

            var player = {
                id: user.id,
                fees: params.room_fee,
                is_active: true
            };

            let flag = false;

            for (let i = 0; i < tableX.players.length; i++) {
                if (tableX.players[i].id.toString() == player.id.toString()) {
                    console.log("i ->", i, tableX.players[i])
                    tableX.players[i] = player;
                    flag = true;
                    break;
                }
            }

            //Save Player to DB
            if (!flag) tableX.players.push(player);
            tableX.created_at = new Date().getTime();
            await tableX.save();
           // await redisCache.addToRedis(room_code,myRoom);
            return {
                callback: callbackRes,
                events: [
                    {
                        type: 'room_excluding_me',
                        room: room_code,
                        name: 'playerJoin',
                        data: {
                            room: room_code,
                            name: user.name,
                            profile: user.profilepic,
                            position: seatOnTable.pos,
                        },
                    },
                ],
                myRoom: myRoom
            };

        } else {
            if (retryCount<3)
            {
                retryCount++;
                return this.joinTournamentV2(params, entry_Fee, myId, user, retryCount);
            }
            else
                return {
                    callback: {
                        status: 0,
                        message: 'An error was encountered. Please join a new game.',
                    },
                };
        }
    },
    getGameUsersData: async function (data)
    {

        let userData = data.table.users;
        console.log("getGameUsersData >", data, userData)
        let reqData = {
            room: data.room,
            amount: data.table.room_fee.toString(),
            users: []
        }
        for (let i = 0; i < userData.length; i++)
        {
            if (userData[i].id != "")
            {
                var us = await User.findById(userData[i].id);
                let json = {
                    "user_id": us.numeric_id,
                    "token": us.token
                }
                reqData.users.push(json)
            }
        }
        return reqData;
    },
    getEndGameData: async function (data, room_fee)
    {
        let userData = data.game_data;
        let reqData = {
            room: data.room,
            amount: room_fee.toString(),
            users: []
        }
        for (let i = 0; i < userData.length; i++)
        {
            if (userData[i].id != "")
            {
                //var us = await User.findById(userData[i].id);
                let json = {
                    "user_id": userData[i].numeric_id,
                    "token": userData[i].token,
                    "rank": userData[i].rank,
                    "score": userData[i].score,
                    "winnings": userData[i].amount
                }
                reqData.users.push(json)
            }
        }
        // After gameEnd records to be deleted from DB.
        // await Table.deleteOne({room: data.room});
        return reqData;
    },
    getDataByRoom : async function (room, myRoom) {
        return _tab.getDataByRoom(room, myRoom);
    },
    // This function used to check equal turn for player.
    checkPlayerEqualTurn : async function(myRoom, playerPosition) {
        //console.log('EqualTurn------>', JSON.stringify(myRoom));
        //console.log('Player Position------>', {playerPosition});
        let foundFirstActiveUser = false;
        let firstActiveUserIndex = 0;
        for (var i = 0; i < myRoom.users.length; i++) {
            if(!myRoom.users[i].hasOwnProperty('is_left')) {
                if(myRoom.users[i].is_active == true 
                    && !foundFirstActiveUser){
                    // playerTurn.push(myRoom.users[i].turn);
                    foundFirstActiveUser = true;
                    firstActiveUserIndex = i;
                }
            }
        }
       //console.log('firstActiveUserIndex----------->', firstActiveUserIndex)
        // if player_index == 0 logic
        return playerPosition == firstActiveUserIndex ? true : false;
    },
    determineTotalTurn : async function(room) {
        let myRoom = await redisCache.getRecordsByKeyRedis(room);
        const playersFinalTurn = [];
        const activeUsers = myRoom.users.filter(user => user.is_active && !user.is_left);
        let currentTurnIndex = myRoom.current_turn;
        const maxTurn = Math.max(...activeUsers.map(user => user.turn));

        for (var i = 0; i < activeUsers.length; i++) {
            if(activeUsers[i].turn < maxTurn){
                playersFinalTurn.push(activeUsers[i].position);
            } else if(activeUsers[i].turn == maxTurn 
                && activeUsers[i].position == currentTurnIndex) {
                playersFinalTurn.push(activeUsers[i].position);
            }
        }
        return {'totalTurn':maxTurn,'finalTurn':playersFinalTurn};              
    },
    deleteRecords : async function () {
        //TODO: delete logic
        //tables: createdOn < = Date.Now - 1 hour // before 1 hour or equal
        //users: updatedAt <= Date.Now-24 hour // before 24 hour or equal
        try {
            // To delete records from Tables table.
            const oneHourAgo = new Date(Date.now() - 1 * 60 * 60 * 1000);
            await Table.deleteMany({ created_at: { $lte: oneHourAgo.getTime() } });

            // To delete records from Users table.
            const tweentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
            await User.deleteMany({ updatedAt: { $ne: -1, $lte: tweentyFourHoursAgo.getTime() } });

            return true;
        } catch (error) {
            console.log(error)
            return false;
        }
        
    }
};
