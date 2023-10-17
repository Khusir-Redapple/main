const _             = require('lodash');
// const {User}        = require('./../../api/models/user');
// const Table         = require('./../../api/models/table');
let Service         = require('./../../api/service');
const config        = require('./../../config');
const localization  = require('./../../api/service/localization');
// let ObjectId        = require('mongoose').Types.ObjectId;
const requestTemplate = require('../../api/service/request-template');
const { _Tables } = require('../utils/_tables');
const _tab = new _Tables();
const redisCache = require('../../api/service/redis-cache');
const logDNA = require('../../api/service/logDNA');

module.exports = {
    //Roll dice for tournament
    tournamntDiceRolled: async function (socket, params, id, myRoom, gamePlayData) {
        // To capture dice tap time.
        if (gamePlayData && gamePlayData.data && gamePlayData.data.dice_tap_time) {
            let diceTapTime = await _tab.setPawnMoveTime(myRoom);
            gamePlayData.data.dice_tap_time.push(diceTapTime);
        }

        let isJackpot = false;
        let resObj = { callback: { status: 1, message: localization.success }, events: [] };
        let threeSix = false;
        // VALIDATE PARAMS
        if (!params) return { callback: { status: 0, message: localization.missingParamError } };
        if (!params.room) return { callback: { status: 0, message: localization.missingParamError } };
        // CHECK IF I EXIST IN THIS ROOM
        var myPos = await _tab.getMyPosition(params.room, id, myRoom);
        if (myPos == -1) return { callback: { status: 0, message: localization.noDataFound } };
        let check = await _tab.isCurrentTurnMine(params.room, myPos, myRoom);
        if (!check) {
            return { callback: { status: 0, message: localization.noDataFound } };
        }
        // GET DICE RANDOM
        let DICE_ROLLED = await _tab.getMyDice(params.room, id, myRoom, gamePlayData);
        //console.log('DICE_ROLLED ====>>>>>', DICE_ROLLED);
        if (DICE_ROLLED > 6 || DICE_ROLLED < 0) return { callback: { status: 0, message: localization.noDataFound } };

        resObj.callback.dice = DICE_ROLLED;
        let dices_rolled = await _tab.gePlayerDices(params.room, myPos, myRoom, gamePlayData);
        //console.log("value got ", dices_rolled);
        let verify = dices_rolled.every((val, i, arr) => val === 6)
        //console.log("verify", verify);
        if (verify && dices_rolled.length == 3) {isJackpot = true}
        //dices_rolled = await _tab.gePlayerDices(params.room, myPos, myRoom, gamePlayData);
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
        let turnTimer = config.turnTimer;
        let tableData = await redisCache.getRecordsByKeyRedis(`table_${myRoom.room}`);
        if('turnTime' in tableData) { turnTimer = tableData.turnTime; }

        if (sixCounts == 2 && dices_rolled[0] == 6) {
            // console.log('SCRAP CURRENT DICES & PASS NEXT DICE_ROLL');
            // console.log("1_" + params.room + "_" + myPos + "_" + myRoom)
            //  SCRAP CURRENT DICES & PASS NEXT DICE_ROLL
            await _tab.scrapTurn(params.room, myPos, myRoom);
            // console.log(' DICE_ROLL TO NEXT');
            // console.log("1_" + params.room + "_" + myPos + "_" + myRoom)
            // DICE_ROLL TO NEXT

            await _tab.setSix(params.room, id, myRoom);
            // console.log('setSix');
            // if consecutive 3 six happans the reset pending bonus.
            // console.log('reset pending bonus');
            await _tab.useBonus(params.room, id, myRoom);

            // console.log("1_" + params.room + "_" + myPos + "_" + myRoom)
            let nextPos = await _tab.getNextPosition(params.room, myPos, myRoom);
            console.log('update turn 1');
            await _tab.updateCurrentTurn(params.room, nextPos, 'turn', myPos, 0, myRoom);
            let DICE_ROLLED_RES = await _tab.rollDice(params.room, nextPos, myRoom);
            let DICE_ROLLED;
            if (DICE_ROLLED_RES) {
                myRoom = DICE_ROLLED_RES.table;
                DICE_ROLLED = DICE_ROLLED_RES.returnDiceValue;
            }
            _tab.diceRolled(params.room, nextPos, DICE_ROLLED, myRoom, gamePlayData);
            dices_rolled = await _tab.gePlayerDices(params.room, nextPos, myRoom, gamePlayData);

            gamePlayData.data.game_time = await _tab.setGameTime(myRoom);
            // console.log('game time from non movable event', gamePlayData.data.game_time);
            await _tab.sendToSqsAndResetGamePlayData(params.room, myRoom, gamePlayData, myPos);

            // to add dice skip, bug_no_64, Ex: if 1 pawn is two steps away from home, when i roll a five then the roll will be skipped. So, need a skipped feedback for this case
            resObj.callback.skip_dice = true;
            threeSix = true;
            // SEND EVENT
            let skipDice = _tab.isSkippable(myRoom, DICE_ROLLED, nextPos);
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
                    dices_rolled: [DICE_ROLLED],
                    turn_start_at: turnTimer,
                    extra_move_animation: false,
                    skip_dice: skipDice,
                    turn_timestamp: myRoom.turn_timestamp,
                    server_time: new Date(),
                },
            };
            myRoom = await _tab.clearDices(params.room, myPos, myRoom);
            resObj.events.push(event);
        }
        if (movePossible) {
            // console.log('[MOVE POSSIBLE DICE ROLLED]');
            let timer = 150; // previously it was 500
            let myPos = await _tab.getMyPosition(params.room, id, myRoom);
            //  MAKE_MOVE TO ME
            let nextPos = await _tab.getNextPosition(params.room, myPos, myRoom);
            // console.log("movePossible >>> sixcount >>", sixCounts, dices_rolled[0], myPos, dices_rolled)
            //revisit

            //if (sixCounts == 2 && dices_rolled[0] == 6) 
            if (threeSix) {
                // console.log('update turn 2');
                //await _tab.updateCurrentTurn(params.room, nextPos, 'roll', myPos,0,myRoom);
            }
            else {
                console.log('update turn 3');
                await _tab.updateCurrentTurn(params.room, myPos, 'move', -1, 1, myRoom);
            };
            let dices_roll = await _tab.gePlayerDices(params.room, myPos, myRoom, gamePlayData);
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
                    turn_start_at: turnTimer,
                    skip_dice: threeSix,
                    turn_timestamp: myRoom.turn_timestamp,
                    server_time: new Date(),
                },
            };
            resObj.events.push(event);
        }
        // ELSE // if both are false
        if (!movePossible && !jackPOT) {
            // console.log('[MOVE IMPOSSIBLE DICE ROLLED]');
            if (DICE_ROLLED != 6) {
                // console.log('[DICE ROLLED NOT SIX]');
                //  SCRAP CURRENT DICES & PASS NEXT DICE_ROLL
                _tab.scrapTurn(params.room, myPos, myRoom);
                // DICE_ROLL TO NEXT
                let timer = 1500;
                let nextPos = await _tab.getNextPosition(params.room, myPos, myRoom);
                console.log('update turn 4');
                await _tab.updateCurrentTurn(params.room, nextPos, 'turn', myPos, 0, myRoom);
                let dices_rolled = await _tab.gePlayerDices(params.room, nextPos, myRoom, gamePlayData);
                let DICE_ROLLED_RES = await _tab.rollDice(params.room, nextPos, myRoom);
                let DICE_ROLLED;
                if (DICE_ROLLED_RES) {
                    myRoom = DICE_ROLLED_RES.table;
                    DICE_ROLLED = DICE_ROLLED_RES.returnDiceValue;
                }
                await _tab.diceRolled(params.room, nextPos, DICE_ROLLED, myRoom, gamePlayData);

                gamePlayData.data.game_time = await _tab.setGameTime(myRoom);
                // console.log('game time from non movable event', gamePlayData.data.game_time);
                await _tab.sendToSqsAndResetGamePlayData(params.room, myRoom, gamePlayData, myPos);
                // to add dice skip, bug_no_64, Ex: if 1 pawn is two steps away from home, when i roll a five then the roll will be skipped. So, need a skipped feedback for this case
                resObj.callback.skip_dice = true;
                let skipDice = _tab.isSkippable(myRoom, DICE_ROLLED, nextPos);
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
                        dices_rolled: [DICE_ROLLED],
                        turn_start_at: turnTimer,
                        extra_move_animation: false,
                        skip_dice: skipDice,
                        turn_timestamp: myRoom.turn_timestamp,
                        server_time: new Date(),
                    },
                };
                resObj.events.push(event);
            }
            /**
             * Bug No: 37
             * when the movable pawn has less than 6 steps to move then we are getting extra move
             */
            else if (movePossible == false && DICE_ROLLED == 6) {
                // console.log('[DICE ROLLED NOT SIX]');
                // reset bonus dice roll & six count.
                await _tab.setSix(params.room, id, myRoom);
                await _tab.useBonus(params.room, id, myRoom);
                //  SCRAP CURRENT DICES & PASS NEXT DICE_ROLL
                _tab.scrapTurn(params.room, myPos, myRoom);
                // DICE_ROLL TO NEXT
                let timer = 1500;
                let nextPos = await _tab.getNextPosition(params.room, myPos, myRoom);
                console.log('update turn 5');
                await _tab.updateCurrentTurn(params.room, nextPos, 'turn', myPos, 0, myRoom);
                let dices_rolled = await _tab.gePlayerDices(params.room, nextPos, myRoom, gamePlayData);
                let DICE_ROLLED_RES = await _tab.rollDice(params.room, nextPos, myRoom);
                let DICE_ROLLED;
                if (DICE_ROLLED_RES) {
                    myRoom = DICE_ROLLED_RES.table;
                    DICE_ROLLED = DICE_ROLLED_RES.returnDiceValue;
                }
                await _tab.diceRolled(params.room, nextPos, DICE_ROLLED, myRoom, gamePlayData);
                gamePlayData.data.game_time = await _tab.setGameTime(myRoom);
                // console.log('game time from non movable event', gamePlayData.data.game_time);
                await _tab.sendToSqsAndResetGamePlayData(params.room, myRoom, gamePlayData, myPos);
                // to add dice skip, bug_no_64, Ex: if 1 pawn is two steps away from home, when i roll a five then the roll will be skipped. So, need a skipped feedback for this case
                resObj.callback.skip_dice = true;
                let skipDice = _tab.isSkippable(myRoom, DICE_ROLLED, nextPos);
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
                        dices_rolled: [DICE_ROLLED],
                        turn_start_at: turnTimer,
                        extra_move_animation: false,
                        skip_dice: skipDice,
                        turn_timestamp: myRoom.turn_timestamp,
                        server_time: new Date(),
                    },
                };
                resObj.events.push(event);
            }

            else {
                var myPos = await _tab.getMyPosition(params.room, id, myRoom);
                let DICE_ROLLED_RES = _tab.getRandomDiceValue(myPos, myRoom, gamePlayData);
                let DICE_ROLLED;
                if (DICE_ROLLED_RES) {
                    myRoom = DICE_ROLLED_RES.table;
                    DICE_ROLLED = DICE_ROLLED_RES.DiceValue;
                    // console.log(JSON.stringify(myRoom));
                }
                // comment the below line to unnessery update value.
                // await _tab.diceRolled(params.room, myPos, DICE_ROLLED, myRoom, gamePlayData);
                console.log('update turn 6');
                await _tab.updateCurrentTurn(params.room, myPos, 'turn', -1, 0, myRoom);
                let dices_rolled = await _tab.gePlayerDices(params.room, myPos, myRoom, gamePlayData);
                // to add dice skip, bug_no_64, Ex: if 1 pawn is two steps away from home, when i roll a five then the roll will be skipped. So, need a skipped feedback for this case
                resObj.callback.skip_dice = false;
                let skipDice = _tab.isSkippable(myRoom, DICE_ROLLED, myPos);
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
                        dices_rolled: [DICE_ROLLED],
                        turn_start_at: turnTimer,
                        extra_move_animation: true,
                        skip_dice: skipDice,
                        turn_timestamp: myRoom.turn_timestamp,
                        server_time: new Date(),
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
    moveTourney: async function (params, id, gamePlayData, myRoom) {
        // console.log('Move Made', params);
        try {
            // To capture pawn tap time
            let pawnTime = await _tab.setPawnMoveTime(myRoom);
            if (gamePlayData && gamePlayData.data) {
                gamePlayData.data.pawn_move_time.push(pawnTime);

                let pawn_move_time = gamePlayData.data.pawn_move_time;
                let dice_tap_time = gamePlayData.data.dice_tap_time;
                let differences = dice_tap_time.map((time, index) => {
                    let timeInSeconds = parseFloat(time);
                    if(pawn_move_time[index] != undefined) {
                      let pawnTime = parseFloat(pawn_move_time[index] || 0);
                       return (timeInSeconds - pawnTime).toFixed(2);
                    }
                  }).filter((ele) => ele!= undefined);                
                gamePlayData.data.time_between_tap_and_move.push(differences[0]);
            }


            // VALIDATION
            if (!params) {
                return { callback: { status: 0, message: localization.missingParamError } };
            } else if (!params.room) {
                return { callback: { status: 0, message: localization.missingParamError } };
            } else if (!params.token_index) {
                return { callback: { status: 0, message: localization.missingParamError } };
            } else if (!params.dice_value) {
                return { callback: { status: 0, message: localization.missingParamError } };
            } else if (parseInt(params.dice_value) > 6) {
                return { callback: { status: 0, message: localization.missingParamError } };
            }
            params.token_index = parseInt(params.token_index);
            params.dice_value = parseInt(params.dice_value);

            let resObj = { callback: { status: 1, message: localization.success, isKillable: false }, events: [] };
            let myPos = await _tab.getMyPosition(params.room, id, myRoom);
            //if (myPos == -1) return {callback: {status: 0, message: localization.noDataFound}};
            let params_data = {
                room: params.room,
            };
            var checkTabel = await this.istableExists(params_data, myRoom); // added to solve backword token movement 
            if (checkTabel.current_turn != myPos) {
                // console.log("IN moveTourney IF - ", checkTabel, myPos); //to handle token revert issue - NO1-I44
                return;
            }
            let diceVales = [];
            diceVales.push(params.dice_value)
            // const allEqual = diceVales => diceVales.every(v => v === 6);

            let turnTimer = config.turnTimer;
            let tableData = await redisCache.getRecordsByKeyRedis(`table_${myRoom.room}`);
            if('turnTime' in tableData) { turnTimer = tableData.turnTime; }

            // to validate player have passed same value that have in backend.
            let diceValue = await _tab.gePlayerDices(params.room, myPos, myRoom, gamePlayData);
            // console.log('roll skip debugging==>', myPos, diceValue);
            if (diceValue.length !== 0 && params.dice_value !=6 && params.dice_value != diceValue) {
                let nextPos = await _tab.getNextPosition(params.room, myPos, myRoom);
                console.log('update turn 7');
                await _tab.updateCurrentTurn(params.room, nextPos, 'turn', -1, 0, myRoom);
                let DICE_ROLLED_RES = await _tab.rollDice(params.room, nextPos, myRoom);
                let DICE_ROLLED;
                if (DICE_ROLLED_RES) {
                    myRoom = DICE_ROLLED_RES.table;
                    DICE_ROLLED = DICE_ROLLED_RES.returnDiceValue;
                }
                await _tab.diceRolled(params.room, nextPos, DICE_ROLLED, myRoom, gamePlayData);
                // console.log('[DICE VALUE SIX]', DICE_ROLLED);
              //  await _tab.diceRolled(params.room, myPos, DICE_ROLLED, myRoom, gamePlayData);
                let dices_rolled = await _tab.gePlayerDices(params.room, nextPos, myRoom, gamePlayData);
                // console.log('[DICE VALUE SIX]', dices_rolled, myPos);
                // SEND EVENT
                let skipDice = _tab.isSkippable(myRoom, DICE_ROLLED, nextPos);
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
                        dices_rolled: [DICE_ROLLED],
                        turn_start_at: turnTimer,
                        extra_move_animation: true,
                        skip_dice: skipDice,
                        turn_timestamp: myRoom.turn_timestamp,
                        server_time: new Date(),
                    },
                };

                resObj.events.push(event);
                gamePlayData.data.game_time = await _tab.setGameTime(myRoom);
                let user_points = 0;
                gamePlayData.data.points_per_diceRoll.map(function (ele) {
                    user_points += ele;
                });
                gamePlayData.data.points = user_points + (+gamePlayData.data.total_move);
                gamePlayData.data.player_score = myRoom.users[myPos].points + myRoom.users[myPos].bonusPoints;
                await _tab.sendToSqsAndResetGamePlayData(params.room, myRoom, gamePlayData, myPos);
                let logData = {
                    level: 'error',
                    meta: { 'env': `${process.env.NODE_ENV}`, 'params': params,"diceValue":diceValue ,"position":myPos}
                };
                logDNA.error('moveTourney attempt to do fraud', logData);
                return resObj;
            }

            if (params.dice_value == 6) {
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
            // console.log('Tournament movePossible >>', movePossibleExact);
            // var tableD = await Table.findOne({
            //     room: params.room,
            // });

            if (!movePossibleExact) {
                // if move not possible.
                if (params.dice_value == 6) {
                    // remove the bonus dice.
                    _tab.useBonus(params.room, id, myRoom);
                    //  SCRAP CURRENT DICES & PASS NEXT DICE_ROLL
                    await _tab.scrapTurn(params.room, myPos, myRoom);
                    // DICE_ROLL TO NEXT
                    let nextPos = await _tab.getNextPosition(params.room, myPos, myRoom);
                    await _tab.scrapTurn(params.room, nextPos, myRoom);
                    console.log('update turn 8');
                    await _tab.updateCurrentTurn(params.room, nextPos, 'turn', myPos, 0, myRoom);
                    let dices_rolled = await _tab.gePlayerDices(params.room, nextPos, myRoom, gamePlayData);
                    let DICE_ROLLED_RES = await _tab.rollDice(params.room, nextPos, myRoom);
                    let DICE_ROLLED;
                    if (DICE_ROLLED_RES) {
                        myRoom = DICE_ROLLED_RES.table;
                        DICE_ROLLED = DICE_ROLLED_RES.returnDiceValue;
                    }
                    await _tab.diceRolled(params.room, nextPos, DICE_ROLLED, myRoom, gamePlayData);
                    let skipDice = _tab.isSkippable(myRoom, DICE_ROLLED, nextPos);
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
                            dices_rolled: [DICE_ROLLED],
                            turn_start_at: turnTimer,
                            extra_move_animation: false,
                            skip_dice: skipDice,
                            turn_timestamp: myRoom.turn_timestamp,
                            server_time: new Date(),
                        },
                    };
                    resObj.events.push(event);
                } else {
                    // Send 'roll' to same player
                     console.log('update turn 10');
                    let nextPos = await _tab.getNextPosition(params.room, myPos, myRoom);
                    //await _tab.updateCurrentTurn(params.room, myPos, 'roll', -1, 0,myRoom);
                    await _tab.updateCurrentTurn(params.room, nextPos, 'turn', myPos, 0, myRoom);
                    let DICE_ROLLED_RES = await _tab.rollDice(params.room, nextPos, myRoom);
                    let DICE_ROLLED;
                    if (DICE_ROLLED_RES) {
                        myRoom = DICE_ROLLED_RES.table;
                        DICE_ROLLED = DICE_ROLLED_RES.returnDiceValue;
                    }
                    await _tab.diceRolled(params.room, nextPos, DICE_ROLLED, myRoom, gamePlayData);
                    // console.log('[DICE VALUE SIX]', DICE_ROLLED);
                    //await _tab.diceRolled(params.room, nextPos, DICE_ROLLED, myRoom, gamePlayData);
                    let dices_rolled = await _tab.gePlayerDices(params.room, nextPos, myRoom, gamePlayData);
                    // console.log('[DICE VALUE SIX]', dices_rolled, myPos);
                    let skipDice = _tab.isSkippable(myRoom, DICE_ROLLED, nextPos);
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
                            dices_rolled: [DICE_ROLLED],
                            turn_start_at: turnTimer,
                            extra_move_animation: false,
                            skip_dice: skipDice,
                            turn_timestamp: myRoom.turn_timestamp,
                            server_time: new Date(),
                        },
                    };

                    resObj.events.push(event);
                }

                // console.log("MOVE NOT POSSIBLE =========>", JSON.stringify(resObj));
                // SEND EVENT
                // update the gamePlay data at the time of skip happen for non moveble event.
                gamePlayData.data.game_time = await _tab.setGameTime(myRoom);
                let user_points = 0;
                gamePlayData.data.points_per_diceRoll.map(function (ele) {
                    user_points += ele;
                });
                gamePlayData.data.points = user_points + (+gamePlayData.data.total_move);
                gamePlayData.data.player_score = myRoom.users[myPos].points + myRoom.users[myPos].bonusPoints;
                await _tab.sendToSqsAndResetGamePlayData(params.room, myRoom, gamePlayData, myPos);

            } else {
                // console.log('[MOVE POSSIBLE EXACT]');
                let moveBonusCheck = true;
                // Make move, Remove dicevalue & get CURRENT_POSITION of token
                var resp = await _tab.makeMoveForTournament(params.dice_value, params.room, id, params.token_index, myRoom, gamePlayData);
                myRoom = resp.table;
                gamePlayData = resp.gamePlayData;
                var token_position = resp.token_position;
                let dices_rolled = await _tab.gePlayerDices(params.room, myPos, myRoom, gamePlayData);
                //console.log('TOK POS----', token_position, dices_rolled);
                let checkPointActivated = _tab.checkPointActive(params.room, myPos, myRoom, gamePlayData);
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
                        isKillable: false,
                        // safeZoneAnimation:checkPointActivated, 
                        // homeAnimation: homeAnimation
                    },
                };
                resObj.events.push(moveMadeEvent);

                var killed = false;
                let killTimer = 4000;
                // if CURRENT_POSITION == 56
                if (token_position == 56) {
                    // console.log('[BEFORE HOME]');
                    /**
                     * Bug NO: 39
                     * If a cut/home happens with a six, then only one extra move should be given
                    */
                    if (params.dice_value != 6) {
                        // Add extra Bonus
                        await _tab.addBonus(params.room, id, 1, "Home", myRoom, gamePlayData);
                        await _tab.addBonusPoints(params.room, id, 50, 1, 'home_base_bonus', myRoom, gamePlayData);
                    }
                    else if (params.dice_value == 6) {
                        // If home happans with six, then extra_roll_reason should be home.
                        if (gamePlayData.data.extra_roll_reason.includes("six")) {
                            gamePlayData.data.extra_roll_reason.map((ele, index) => {
                                if (ele == 'six') {
                                    gamePlayData.data.extra_roll_reason.splice(index, 1);
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
                    if (allHomeRes) {
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
                        if (endGameRes) {
                            myRoom = endGameRes.table;
                            endGame = endGameRes.rank;
                        }
                        if (endGame)
                        {
                            let tableD = await redisCache.getRecordsByKeyRedis(`table_${params.room}`);

                            // Update values in user wallets & table data [DB]
                            // console.log('tableD::', tableD);
                            if (tableD) {
                                // console.log("GAME END :: >>>>>>>");
                                // in redis updated isGameCompleted property
                                myRoom.isGameCompleted = true;
                                await redisCache.addToRedis(params.room, myRoom);
                                endGame.map(async (eGame) => {
                                    tableD.players.map(async (playersTable) => {
                                        if (eGame.id.toString() == playersTable.id.toString()) {
                                            playersTable.rank = eGame.rank;
                                            playersTable.pl = eGame.amount;
                                        }
                                    });
                                });

                                tableD.game_completed_at = new Date().getTime();
                                tableD.isGameCompleted   = true;
                                await redisCache.addToRedis(`table_${params.room}`,tableD);
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
                            // console.log("END-GAME-DATA-1", reqData);
                            let startGame = await requestTemplate.post(`endgame`, reqData);
                            // if (!startGame.isSuccess)
                            // {
                            //     return {callback: {status: 0, message: startGame.error}};
                            // }
                            // send 
                            let user_points = 0;
                            gamePlayData.data.points_per_diceRoll.map(function (ele) {
                                user_points += ele;
                            });
                            // console.log("DICE VALUE BONUS ===>", gamePlayData.data.points_per_diceRoll);
                            // console.log("AFTER ADDITION ===>", user_points);


                            gamePlayData.data.player_score += user_points;
                            gamePlayData.data.points += user_points;
                            await _tab.sendToSqsAndResetGamePlayData(params.room, myRoom, gamePlayData, myPos);
                            return resObj;
                        }
                        // Else [!endGame]
                        else {
                            //  SCRAP CURRENT DICES & PASS NEXT DICE_ROLL
                            let sixCounts = await _tab.setSix(params.room, id, myRoom);
                            // console.log("set six...2")
                            await _tab.scrapTurn(params.room, myPos, myRoom);
                            // DICE_ROLL TO NEXT
                            let nextPos = await _tab.getNextPosition(params.room, myPos, myRoom);
                            console.log('update turn 11');
                            await _tab.updateCurrentTurn(params.room, nextPos, 'turn', myPos, 0, myRoom);
                            let dices_rolled = await _tab.gePlayerDices(params.room, nextPos, myRoom, gamePlayData);
                            let DICE_ROLLED_RES = await _tab.rollDice(params.room, nextPos, myRoom);
                            let DICE_ROLLED;
                            if (DICE_ROLLED_RES) {
                                myRoom = DICE_ROLLED_RES.table;
                                DICE_ROLLED = DICE_ROLLED_RES.returnDiceValue;
                            }
                            await _tab.diceRolled(params.room, nextPos, DICE_ROLLED, myRoom, gamePlayData);
                            await _tab.sendToSqsAndResetGamePlayData(params.room, myRoom, gamePlayData, myPos);
                            let skipDice = _tab.isSkippable(myRoom, DICE_ROLLED, nextPos);
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
                                    dices_rolled: [DICE_ROLLED],
                                    turn_start_at: turnTimer,
                                    extra_move_animation: false,
                                    skip_dice: skipDice,
                                    turn_timestamp: myRoom.turn_timestamp,
                                    server_time: new Date(),
                                },
                            };
                            resObj.events.push(event);
                        }
                    }
                    // Else [!allHome]
                    else {
                        moveBonusCheck = true;
                    }
                }
                // Else [!56]
                else {
                    // console.log('[BEFORE NOT HOME]');
                    // Check If Killing Possible (Kill & Get Tokens)
                    // 
                    // console.log("can i kill true.........")
                    try {
                        // console.log('gamePlayDatNew: ' + JSON.stringify(gamePlayData));

                        var canIKillRes = await _tab.CanIKill(params.room, id, params.token_index, myPos, myRoom, gamePlayData);

                        myRoom = canIKillRes.myRoom;
                        gamePlayData = canIKillRes.gameData;
                        // added new line
                        //await redisCache.addToRedis('gamePlay_'+myRoom.room ,gamePlayData);

                        // console.log("canIKill >>>", canIKillRes)
                        let canIKill = canIKillRes.dead_possible;
                        if (canIKill) {
                            // console.log("canIKill true:::", canIKill[0])
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
                                if (resObj.events[index].name == 'move_made') {
                                    resObj.events[index].data.isKillable = true;
                                }
                            }

                            resObj.events.push(event);

                            /**
                             * Bug NO: 39
                             * If a cut/home happens with a six, then only one extra move should be given
                             */

                            // If cut/home happen with 6, then only one extra move given. not two
                            if (params.dice_value == 6) {
                                // If kill happans with six, then extra_roll_reason should be Kill.
                                if (gamePlayData.data.extra_roll_reason.includes("six")) {
                                    gamePlayData.data.extra_roll_reason.map((ele, index) => {
                                        if (ele == 'six') {
                                            gamePlayData.data.extra_roll_reason.splice(index, 1);
                                        }
                                    });
                                }

                                // moveBonusCheck = true;
                                killed = true;
                                await _tab.addBonus(params.room, id, 0, "Kill", myRoom, gamePlayData);
                                await _tab.addBonusPoints(params.room, id, 20, canIKill.length, 'cut_bonus', myRoom, gamePlayData)
                                // console.log('after cut ------>', myRoom);
                            } else {
                                // Add Bonus as much as Killed Token Length
                                let sixCounts = _tab.setSix(params.room, id, myRoom);
                                // bugNo: 79 user should no offer more then two dice roll
                                if (canIKill.length >= 1) {
                                    await _tab.addBonus(params.room, id, 1, "Kill", myRoom, gamePlayData);
                                }
                                // _tab.addBonus(params.room, id, canIKill.length, "Kill");                            
                                await _tab.addBonusPoints(params.room, id, 20, canIKill.length, 'cut_bonus', myRoom, gamePlayData)
                                // console.log('after cut ------>', myRoom);
                                // moveBonusCheck = true;
                                killed = true;
                            }
                            moveBonusCheck = true;
                        }
                        // Else [!canIKill]
                        // else
                        // {
                        //     moveBonusCheck = true;
                        // }
                        moveBonusCheck = true;
                    } catch (err) {
                        let logData = {
                            level: 'error',
                            meta: { 'env': `${process.env.NODE_ENV}`, 'error': err, 'params': params, 'room': myRoom, stackTrace: err.stack }
                        };
                        logDNA.error('moveTourney 2', logData);
                    }

                }

                // console.log('BONUS', moveBonusCheck);
                // IF moveBonusCheck
                if (moveBonusCheck) {
                    let movePossible = await _tab.isMovePossible(params.room, id, myRoom);
                    // console.log('movePossible >>', movePossible);

                    let timer = 1500; //1500;
                    if (killed) timer = killTimer;//4000 //nostra 3000

                    // If Move Possible
                    if (movePossible) {
                        //  MAKE_MOVE TO ME
                         console.log('update turn 12');
                        await _tab.updateCurrentTurn(params.room, myPos, 'move', -1, 0, myRoom);
                        setTimeout(function () {
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
                                turn_start_at: turnTimer,
                                turn_timestamp: myRoom.turn_timestamp,
                                server_time: new Date(),
                            },
                        };
                        resObj.events.push(event);
                    }
                    // Else [!movePossible]
                    else {
                        // console.log("in the SCRAP TURNB");
                        // scrapTurn
                        // let sixCounts = await _tab.setSix(params.room, id);
                        // console.log("set six...3")
                        _tab.scrapTurn(params.room, myPos, myRoom);

                        // Check If Bonus Pending
                        let pendingBonus = await _tab.getBonus(params.room, id, myRoom);
                        // console.log('GET BONUS', pendingBonus);
                        if (pendingBonus > 0) {
                            // console.log("in the SCRAP TURNB 11");
                            // Deduct Bonus
                            await _tab.useBonus(params.room, id, myRoom);
                            // Send 'roll' to same player
                            console.log('update turn 13');
                            await _tab.updateCurrentTurn(params.room, myPos, 'turn', -1, 0, myRoom);
                            setTimeout(function () {
                                _tab.updateCurrentTime(params.room, myRoom); /// to solve early leave deduction on token kill
                            }, timer)
                            let dices_rolled = await _tab.gePlayerDices(params.room, myPos, myRoom, gamePlayData);
                            // let DICE_ROLLED = _tab.rollDice(params.room, id);
                            let DICE_ROLLED_RES = _tab.getRandomDiceValue(myPos, myRoom, gamePlayData);
                            let DICE_ROLLED;
                            if (DICE_ROLLED_RES) {
                                myRoom = DICE_ROLLED_RES.table;
                                DICE_ROLLED = DICE_ROLLED_RES.DiceValue;
                                // console.log(JSON.stringify(myRoom));
                            }
                            // console.log('Six skip debugging...', myPos, DICE_ROLLED);
                            await _tab.diceRolled(params.room, myPos, DICE_ROLLED, myRoom, gamePlayData);
                            // SEND EVENT
                            let skipDice = _tab.isSkippable(myRoom, DICE_ROLLED, myPos);
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
                                    dices_rolled: [DICE_ROLLED],
                                    turn_start_at: turnTimer,
                                    extra_move_animation: true,
                                    skip_dice: skipDice,
                                    turn_timestamp: myRoom.turn_timestamp,
                                    server_time: new Date(),
                                },
                            };
                            resObj.events.push(event);
                        }
                        // Else [!BonusPending]
                        else {
                            // If no pending dice roll then reset the six counter.
                            await _tab.setSix(params.room, id, myRoom);
                            await _tab.scrapTurn(params.room, myPos, myRoom);
                            let nextPos = await _tab.getNextPosition(params.room, myPos, myRoom);
                             console.log('update turn 14');
                            await _tab.updateCurrentTurn(params.room, nextPos, 'turn', myPos, 0, myRoom);
                            let dices_rolled = await _tab.gePlayerDices(params.room, nextPos, myRoom, gamePlayData);
                            // let DICE_ROLLED = await _tab.rollDice(params.room, id);
                            let DICE_ROLLED_RES = await _tab.rollDice(params.room, nextPos, myRoom);
                            let DICE_ROLLED;
                            if (DICE_ROLLED_RES) {
                                myRoom = DICE_ROLLED_RES.table;
                                DICE_ROLLED = DICE_ROLLED_RES.returnDiceValue;
                            }
                            await _tab.diceRolled(params.room, nextPos, DICE_ROLLED, myRoom, gamePlayData);
                            // Update player_score and player_points in gamePlayData
                            // SEND EVENT
                            let user_points = 0;
                            gamePlayData.data.points_per_diceRoll.map(function (ele) {
                                user_points += ele;
                            });
                            gamePlayData.data.points = user_points + (+gamePlayData.data.total_move);
                            gamePlayData.data.player_score = myRoom.users[myPos].points + myRoom.users[myPos].bonusPoints;
                            await _tab.sendToSqsAndResetGamePlayData(params.room, myRoom, gamePlayData, myPos);
                            // SEND EVENT
                            let skipDice = _tab.isSkippable(myRoom, DICE_ROLLED, nextPos);
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
                                    dices_rolled: [DICE_ROLLED],
                                    turn_start_at: turnTimer,
                                    extra_move_animation: false,
                                    skip_dice: skipDice,
                                    turn_timestamp: myRoom.turn_timestamp,
                                    server_time: new Date(),
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
            // console.log('ERROR', err);

            let logData = {
                level: 'error',
                meta: { 'env': `${process.env.NODE_ENV}`, 'error': err, 'params': params, 'room': myRoom, stackTrace: err.stack }
            };
            logDNA.error('moveTourney 3', logData);
        }
    },

    checkwinnerOfTournament: async function (room,myRoom)
    {
        let tableD = await redisCache.getRecordsByKeyRedis(`table_${room}`);
        if (tableD)
        {
            // console.log('AMount>>>', tableD.win_amount);
            winnerRes = await _tab.EndOfTournamentV2(tableD.room, tableD.win_amount, myRoom);
            myRoom = winnerRes.table;
            let winnerInfo = winnerRes.winner;
            if (winnerInfo) {
                // in redis updated isGameCompleted property
                myRoom.isGameCompleted = true;
                await redisCache.addToRedis(room, myRoom);
                for (let j = 0; j < winnerInfo.length; j++) {
                    for (let k = 0; k < tableD.players.length; k++) {
                        if (winnerInfo[j].id.toString() == tableD.players[k].id.toString()) {
                            tableD.players[k].rank = winnerInfo[j].rank;
                            tableD.players[k].pl = winnerInfo[j].amount;
                        }
                    }
                }
                tableD.game_completed_at = new Date().getTime();
                tableD.isGameCompleted   = true;
                await redisCache.addToRedis(`table_${room}`, tableD);
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
                // console.log("END-GAME-DATA-2", reqData);
                let startGame = await requestTemplate.post(`endgame`, reqData);
                // if (!startGame.isSuccess)
                // {
                //     return {callback: {status: 0, message: startGame.error}};
                // }
                //return event;
                let resObj = {
                    'events': [],
                    'table': myRoom
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
    leaveTable: async function (params, id, socket, myRoom, gamePlayData) {
        // To set game time in leave table 
        if (gamePlayData && gamePlayData.data) {
            gamePlayData.data.game_time = await _tab.setGameTime(myRoom);
        }
        let refund = '';
        if (!Service.validateObjectId(id))
            return {
                callback: {
                    status: 0,
                    message: localization.missingParamError,
                    refund: refund
                },
            };

        // var us = await User.findById(id);
        if (!params)
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
        var rez = await _tab.leave(params.room, id, myRoom);
        // console.log('LEAVE RES', rez); //2|socket  | [2022-04-13T11:01:02.572] [INFO] default - LEAVE RES { res: false, flag: 1, remove: true }
        let turnTimer = config.turnTimer;
        let tableData = await redisCache.getRecordsByKeyRedis(`table_${myRoom.room}`);
        if(tableData && 'turnTime' in tableData) { turnTimer = tableData.turnTime; }

        if (params && params.gameNotStarted && params.gameNotStarted == 'true')
        {
            // this.refundMoney(tableD,id);
            refund = localization.insufficientPlayer;
            // remove room from redis cache after player refunded & match unsucessfull.
            await redisCache.removeDataFromRedis(params.room);
            await redisCache.removeDataFromRedis('room_' + params.room);
            await redisCache.removeDataFromRedis('gamePlay_' + params.room);
        }
        // let myUser = myRoom.users.find((element) => element.id == id.toString());
        let myTable = await redisCache.getRecordsByKeyRedis(`table_${params.room}`);
        let myUser = myTable.players.find((ele) => ele.id == id.toString());
        let reqData
        if(myUser) {
            reqData = {
                room: params.room,
                amount: myRoom.room_fee ? myRoom.room_fee.toString():'0',
                users: [{
                    "user_id": myUser.id,
                    "token": myUser.token,
                    "isRefund": params.isRefund ? params.isRefund : false
                }]
            }
        } else {
            reqData = {
                room: params.room,
                amount: myRoom.room_fee ? myRoom.room_fee.toString():'0',
                users: [{
                    "user_id": 'null',
                    "token": 'null',
                    "isRefund": params.isRefund ? params.isRefund : false
                }]
            }
        }
        if (!rez.res && rez.flag == 1)
        {
            //remove player
            const newArr = myTable.players.filter(object => {
                return object.id !== id.toString();
              });
            myTable.players = newArr;

        } else {
            // update status false to player
            let idx = myTable.players.findIndex(x => x.id == id.toString());
            if (typeof myTable.players[idx] !== 'undefined') {
                myTable.players[idx].is_active = false;
            }
        }
        await redisCache.addToRedis(`table_${params.room}`, myTable);

        //Bug_no: 79 comment this line for testing.
        await requestTemplate.post(`matchmakingFailed`, reqData);
        // console.log('BEFORE API calling :: ', rez);
        if (!rez.res) {
            return {
                callback: {
                    status: 1,
                    header: refund != '' ? "Opponent Not Found" : "Server Error",
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
                            header: refund != '' ? "Opponent Not Found" : "Server Error",
                            message: refund != '' ? refund : localization.ServerError,
                            refund: refund
                        },
                    },
                ],
            };
        } else {
            const userData = [];
            myRoom.users.map((cur) => {
                userData.push({
                    "player_index": cur.position,
                    "numeric_id": cur.numeric_id,
                    "token": cur.user_token,
                    "id": cur.id,
                    "name": cur.name,
                    "rank": 0,
                    "amount": 0,
                    "is_left": cur.hasOwnProperty('is_left') ? cur.is_left : false,
                    "score": 0
                });
            }, [])

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

            // console.log("checkOnlyPlayerLeft - ", checkOnlyPlayerLeft)
            // CheckIfOnlyPlayerLeft
            if (checkOnlyPlayerLeft) {
                // Check if EndGame Possible
                // let tableD = await Table.findOne({
                //     room: params.room,
                // });
                let tableD = await redisCache.getRecordsByKeyRedis(`table_${params.room}`);
                var endGameRes = await _tab.calculateGameEndData(params.room, myRoom.win_amount, myRoom);
                let endGame;
                if (endGameRes) {
                    myRoom = endGameRes.table;
                    endGame = endGameRes.rank;
                }
                if (endGame)
                {
                    if (tableD)
                    {
                        // in redis updated isGameCompleted property
                        myRoom.isGameCompleted = true;
                        await redisCache.addToRedis(params.room, myRoom);
                        for (let j = 0; j < endGame.length; j++) {
                            for (let k = 0; k < tableD.players.length; k++) {
                                if (endGame[j].id.toString() == tableD.players[k].id.toString()) {
                                    tableD.players[k].rank = endGame[j].rank;
                                    tableD.players[k].pl = endGame[j].amount;
                                }
                            }
                        }
                        tableD.game_completed_at = new Date().getTime();
                        tableD.isGameCompleted   = true;
                        await redisCache.addToRedis(`table_${params.room}`,tableD);
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
                    // console.log("END-GAME-DATA-3", reqData);
                    let startGame = await requestTemplate.post(`endgame`, reqData);
                    // if (!startGame.isSuccess)
                    // {
                    //     return {callback: {status: 0, message: startGame.error}};
                    // }
                }
                // Else [!endGame]
                else {
                    let myPos = await _tab.getMyPosition(params.room, id, myRoom);
                    //  SCRAP CURRENT DICES & PASS NEXT DICE_ROLL
                    await _tab.scrapTurn(params.room, myPos, myRoom);
                    // DICE_ROLL TO NEXT
                    let nextPos = await _tab.getNextPosition(params.room, myPos, myRoom);
                     console.log('update turn 15');
                    await _tab.updateCurrentTurn(params.room, nextPos, 'turn', myPos, 0, myRoom);
                    let dices_rolled = await _tab.gePlayerDices(params.room, nextPos, myRoom, gamePlayData);
                    // let DICE_ROLLED = await _tab.rollDice(params.room, id);
                    let DICE_ROLLED_RES = await _tab.rollDice(params.room, nextPos, myRoom);
                    let DICE_ROLLED;
                    if (DICE_ROLLED_RES) {
                        myRoom = DICE_ROLLED_RES.table;
                        DICE_ROLLED = DICE_ROLLED_RES.returnDiceValue;
                    }
                    await _tab.diceRolled(params.room, nextPos, DICE_ROLLED, myRoom, gamePlayData);
                    await _tab.sendToSqsAndResetGamePlayData(params.room, myRoom, gamePlayData, myPos);
                    // SEND EVENT
                    let skipDice = _tab.isSkippable(myRoom, DICE_ROLLED, nextPos);
                    let event = {
                        type: 'room_including_me',
                        room: params.room,
                        delay: 1500,
                        name: 'make_diceroll',
                        data: {
                            room: params.room,
                            position: nextPos,
                            tokens: _tab.getToken,
                            dices_rolled: [DICE_ROLLED],
                            dice: DICE_ROLLED,
                            turn_start_at: turnTimer,
                            extra_move_animation: false,
                            skip_dice: skipDice,
                            turn_timestamp: myRoom.turn_timestamp,
                            server_time: new Date(),
                        },
                    };
                    rez_finalObj.events.push(event);
                }
            } else {
                let mypos = await _tab.getMyPosition(params.room, id, myRoom);
                // console.log('My position::', mypos);

                if (mypos != -1) {
                    let check = await _tab.isCurrentTurnMine(params.room, mypos, myRoom);
                    if (check) {
                        //  SCRAP CURRENT DICES & PASS NEXT DICE_ROLL
                        // console.log('SCRAP CURRENT DICES ROOM: ' + JSON.stringify(myRoom));
                        await _tab.scrapTurn(params.room, mypos, myRoom);
                        // nextPosition find & add event dice_roll
                        // console.log('SCRAP CURRENT DICES ROOM1: ' + JSON.stringify(myRoom));
                        let nextPos = await _tab.getNextPosition(params.room, mypos, myRoom);
                         console.log('update turn 16');
                        // console.log('SCRAP CURRENT DICES ROOM2: ' + JSON.stringify(myRoom));

                        await _tab.updateCurrentTurn(params.room, nextPos, 'turn', mypos, 0, myRoom);
                        // console.log('11111');
                        let dices_rolled = await _tab.gePlayerDices(params.room, nextPos, myRoom, gamePlayData);
                        // let DICE_ROLLED = await _tab.rollDice(params.room, id);
                        // console.log('22222');
                        let DICE_ROLLED_RES = await _tab.rollDice(params.room, nextPos, myRoom);
                        // console.log('33333');
                        let DICE_ROLLED;
                        if (DICE_ROLLED_RES) {
                            myRoom = DICE_ROLLED_RES.table;
                            DICE_ROLLED = DICE_ROLLED_RES.returnDiceValue;
                        }
                        // console.log('444444');
                        await _tab.diceRolled(params.room, nextPos, DICE_ROLLED, myRoom, gamePlayData);
                        // console.log('55555');
                        await _tab.sendToSqsAndResetGamePlayData(params.room, myRoom, gamePlayData, mypos);
                        // console.log('66666');
                        let skipDice = _tab.isSkippable(myRoom, DICE_ROLLED, nextPos);
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
                                dices_rolled: [DICE_ROLLED],
                                turn_start_at: turnTimer,
                                extra_move_animation: false,
                                skip_dice: skipDice,
                                turn_timestamp: myRoom.turn_timestamp,
                                server_time: new Date(),
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
    skipTurn: async function (params, id, myRoom, gamePlayData) {
        let turnTimer = config.turnTimer;
        let tableData = await redisCache.getRecordsByKeyRedis(`table_${myRoom.room}`);
        if('turnTime' in tableData) { turnTimer = tableData.turnTime; }
        
        if (!params || !params.room) {
            return {
                callback: {
                    status: 0,
                    message: localization.missingParamError,
                    'table': myRoom,
                    'gamePlayData': gamePlayData
                },
            };
        }
        var mypos = await _tab.getMyPosition(params.room, id, myRoom);
        // console.log('My position::', mypos);
        gamePlayData.data.game_time = await _tab.setGameTime(myRoom);
        if (mypos != -1) {
            var check = await _tab.isCurrentTurnMine(params.room, mypos, myRoom);

            if (check) {
                let deductRes = await _tab.deductLife(params.room, id, myRoom, gamePlayData);
                myRoom = deductRes.table;
                gamePlayData = deductRes.gameData;
                var checkLife = await _tab.getMyLife(params.room, id, myRoom);

                // console.log('Current Life::', checkLife);

                if (checkLife == 0) {
                    //leave table and pass turn to next player
                    var rez = await _tab.leave(params.room, id, myRoom);
                    // console.log('REZ', rez);
                    if (!rez.res) {
                        return {
                            callback: {
                                status: 0,
                                message: localization.ServerError,
                            },
                            'table': myRoom,
                            'gamePlayData': gamePlayData
                        };
                    } else {
                        const userData = [];
                        myRoom.users.map((cur) => {
                            userData.push({
                                "player_index": cur.position,
                                "numeric_id": cur.numeric_id,
                                "id": cur.id,
                                "name": cur.name,
                                "rank": 0,
                                "amount": 0,
                                "is_left": cur.hasOwnProperty('is_left') ? cur.is_left : false,
                                "score": 0
                            });
                        }, [])

                        var rez_finalObj = {
                            callback: {
                                status: 2,
                                message: localization.success,
                            },
                            'table': myRoom,
                            'gamePlayData': gamePlayData,
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

                        // CheckIfOnlyPlayerLeft
                        // let tableD = await Table.findOne({
                        //     room: params.room,
                        // });

                        //var us = await User.findById(id);
                        let us = myRoom.users.find((ele) => ele.id == id.toString());
                        // console.log("MyRoom====>", myRoom, us);
                        let reqData = {
                            room: params.room,
                            //amount: tableD.room_fee.toString(),
                            amount:myRoom.room_fee ? myRoom.room_fee.toString():'0',
                            users: [{
                                "user_id": us.numeric_id,
                                "token": us.user_token,
                                "isRefund": params.isRefund ? params.isRefund : false
                            }]
                        }

                        await requestTemplate.post(`matchmakingFailed`, reqData)
                        if (checkOnlyPlayerLeft) {
                            // Check if EndGame Possible
                            let endGameRes = await _tab.calculateGameEndData(params.room, myRoom.win_amount, myRoom);
                            let endGame;
                            if (endGameRes) {
                                myRoom = endGameRes.table;
                                endGame = endGameRes.rank;
                            }
                            if (endGame)
                            {
                                let tableD = await redisCache.getRecordsByKeyRedis(`table_${params.room}`);
                                if (tableD)
                                {
                                    // console.log(`PL:: <<<<<<<< END GAME >>>>>>>>>`);
                                    // in redis updated isGameCompleted property
                                    myRoom.isGameCompleted = true;
                                    await redisCache.addToRedis(params.room, myRoom);
                                    endGame.map((eGame) => {
                                        tableD.players.map((playersTable) => {
                                            if (eGame.id.toString() == playersTable.id.toString()) {
                                                playersTable.rank = eGame.rank;
                                                playersTable.pl = eGame.amount;
                                            }
                                        })
                                    })

                                    tableD.game_completed_at = new Date().getTime();
                                    tableD.isGameCompleted   = true;
                                    await redisCache.addToRedis(`table_${params.room}`,tableD);

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
                                // console.log("END-GAME-DATA-4", reqData);
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
                            else {
                                let myPos = await _tab.getMyPosition(params.room, id, myRoom);
                                //  SCRAP CURRENT DICES & PASS NEXT DICE_ROLL
                                await _tab.scrapTurn(params.room, myPos, myRoom);
                                // DICE_ROLL TO NEXT
                                let nextPos = await _tab.getNextPosition(params.room, myPos, myRoom);
                                 console.log('update turn 17');
                                await _tab.updateCurrentTurn(params.room, nextPos, 'turn', myPos, 0, myRoom);
                                let dices_rolled = await _tab.gePlayerDices(params.room, nextPos, myRoom, gamePlayData);
                                // let DICE_ROLLED = await _tab.rollDice(params.room, id);
                                let DICE_ROLLED_RES = await _tab.rollDice(params.room, nextPos, myRoom);
                                let DICE_ROLLED;
                                if (DICE_ROLLED_RES) {
                                    myRoom = DICE_ROLLED_RES.table;
                                    DICE_ROLLED = DICE_ROLLED_RES.returnDiceValue;
                                }
                                await _tab.diceRolled(params.room, nextPos, DICE_ROLLED, myRoom, gamePlayData);
                                await _tab.sendToSqsAndResetGamePlayData(params.room, myRoom, gamePlayData, myPos);
                                // SEND EVENT
                                let skipDice = _tab.isSkippable(myRoom, DICE_ROLLED, nextPos);
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
                                        dices_rolled: [DICE_ROLLED],
                                        turn_start_at: turnTimer,
                                        extra_move_animation: false,
                                        skip_dice: skipDice,
                                        turn_timestamp: myRoom.turn_timestamp,
                                        server_time: new Date(),
                                    },
                                };
                                rez_finalObj.events.push(event);
                            }
                        } else {
                            let mypos = await _tab.getMyPosition(params.room, id, myRoom);
                            // console.log('My position::', mypos);

                            if (mypos != -1) {
                                let check = await _tab.isCurrentTurnMine(params.room, mypos, myRoom);
                                if (check) {
                                    //  SCRAP CURRENT DICES & PASS NEXT DICE_ROLL
                                    await _tab.scrapTurn(params.room, mypos, myRoom);
                                    // nextPosition find & add event dice_roll
                                    let nextPos = await _tab.getNextPosition(params.room, mypos, myRoom);
                                     console.log('update turn 18');
                                    await _tab.updateCurrentTurn(params.room, nextPos, 'turn', mypos, 0, myRoom);
                                    let dices_rolled = await _tab.gePlayerDices(params.room, nextPos, myRoom, gamePlayData);
                                    // let DICE_ROLLED = await _tab.rollDice(params.room, id);
                                    let DICE_ROLLED_RES = await _tab.rollDice(params.room, nextPos, myRoom);
                                    let DICE_ROLLED;
                                    if (DICE_ROLLED_RES) {
                                        myRoom = DICE_ROLLED_RES.table;
                                        DICE_ROLLED = DICE_ROLLED_RES.returnDiceValue;
                                    }
                                    await _tab.diceRolled(params.room, nextPos, DICE_ROLLED, myRoom, gamePlayData);
                                    await _tab.sendToSqsAndResetGamePlayData(params.room, myRoom, gamePlayData, mypos);
                                    let skipDice = _tab.isSkippable(myRoom, DICE_ROLLED, nextPos);
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
                                            dices_rolled: [DICE_ROLLED],
                                            turn_start_at: turnTimer,
                                            extra_move_animation: false,
                                            skip_dice: skipDice,
                                            turn_timestamp: myRoom.turn_timestamp,
                                            server_time: new Date(),
                                        },
                                    };

                                    rez_finalObj.events.push(event);
                                }
                            }
                        }
                        rez_finalObj.table = myRoom;
                        rez.gamePlayData = gamePlayData;
                        return rez_finalObj;
                    }
                } else {
                    var resObj = {
                        callback: {
                            status: 1,
                            message: localization.success,
                        },
                        'table': myRoom,
                        'gamePlayData': gamePlayData,
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
                    // console.log('GET BONUS', pendingBonus);
                    if (pendingBonus > 0) {
                        // console.log("in the SCRAP TURNB 11");
                        // Deduct Bonus
                        await _tab.useBonus(params.room, id, myRoom);
                        // Send 'roll' to same player
                        console.log('update turn 19');
                        await _tab.updateCurrentTurn(params.room, mypos, 'turn', -1, 0, myRoom);
                        let dices_rolled = await _tab.gePlayerDices(params.room, mypos, myRoom, gamePlayData);
                        // let DICE_ROLLED = _tab.rollDice(params.room, id);
                        let DICE_ROLLED_RES = _tab.getRandomDiceValue(mypos, myRoom, gamePlayData);
                        let DICE_ROLLED;
                        if (DICE_ROLLED_RES) {
                            myRoom = DICE_ROLLED_RES.table;
                            DICE_ROLLED = DICE_ROLLED_RES.DiceValue;
                            // console.log(JSON.stringify(myRoom));
                        }
                        await _tab.diceRolled(params.room, mypos, DICE_ROLLED, myRoom, gamePlayData);
                        // SEND EVENT
                        let skipDice = _tab.isSkippable(myRoom, DICE_ROLLED, mypos);
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
                                dices_rolled: [DICE_ROLLED],
                                turn_start_at: turnTimer,
                                extra_move_animation: true,
                                skip_dice: skipDice,
                                turn_timestamp: myRoom.turn_timestamp,
                                server_time: new Date(),
                            },
                        };
                        resObj.events.push(event);

                    }
                    // Else [!BonusPending]
                    else {
                        // nextPosition find & add event dice_roll
                        let nextPos = await _tab.getNextPosition(params.room, mypos, myRoom);
                         console.log('update turn 20');
                        await _tab.updateCurrentTurn(params.room, nextPos, 'turn', mypos, 0, myRoom);
                        //console.log("gamePlayData before 1: " + JSON.stringify(gamePlayData));
                        let dices_rolled = await _tab.gePlayerDices(params.room, nextPos, myRoom, gamePlayData);
                        // let DICE_ROLLED = await _tab.rollDice(params.room, id);

                        //console.log("gamePlayData before 2: " + JSON.stringify(gamePlayData));
                        let DICE_ROLLED_RES = await _tab.rollDice(params.room, nextPos, myRoom);
                        let DICE_ROLLED;
                        if (DICE_ROLLED_RES) {
                            myRoom = DICE_ROLLED_RES.table;
                            DICE_ROLLED = DICE_ROLLED_RES.returnDiceValue;
                        }
                        await _tab.diceRolled(params.room, nextPos, DICE_ROLLED, myRoom, gamePlayData);
                       // console.log("gamePlayData before 3: " + JSON.stringify(gamePlayData));
                        await _tab.sendToSqsAndResetGamePlayData(params.room, myRoom, gamePlayData, mypos);
                        //console.log("gamePlayData before 4: " + JSON.stringify(gamePlayData));
                        let skipDice = _tab.isSkippable(myRoom, DICE_ROLLED, nextPos);
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
                                dices_rolled: [DICE_ROLLED],
                                turn_start_at: turnTimer,
                                extra_move_animation: false,
                                skip_dice: skipDice,
                                turn_timestamp: myRoom.turn_timestamp,
                                server_time: new Date(),
                            },
                        };

                        resObj.events.push(event);
                    }
                    resObj.table = myRoom;
                    resObj.gamePlayData = gamePlayData;
                    return resObj;
                }
            } else {
                return {
                    callback: {
                        status: 0,
                        message: localization.NotYourMoveError,
                    },
                    'table': myRoom,
                    'gamePlayData': gamePlayData
                };
            }
        } else {
            return {
                callback: {
                    status: 0,
                    message: localization.ServerError,
                },
                'table': myRoom,
                'gamePlayData': gamePlayData
            };
        }
    },
    startIfPossibleTournament: async function (params, myRoom, gamePlayData)
    {
        // console.log('StartIfPossible request IN', params);

        if (!params) return false;

        if (!params.room) return false;

        let start = await _tab.tournamentStartGame(params.room, myRoom, gamePlayData);
        console.log('AFTER START ==>', JSON.stringify(start));
        // let tableD = await Table.findOne({room: params.room});
        let tableD = await redisCache.getRecordsByKeyRedis(`table_${params.room}`);

        if (tableD)
        {
            // if game start & move happend at tie time then
            let currentData = new Date();
            // currentData.setSeconds(currentData.getSeconds() - 1);
            currentData.setSeconds(currentData.getSeconds() + 2.5);

            let time = new Date(currentData).getTime();
            tableD.game_started_at = '-1';

            let turnTime = new Date();
            const newTurnTime = new Date(turnTime.getTime() + 3);
            tableD.turn_start_at = new Date(newTurnTime).getTime();

            // tableD.turn_start_at = new Date().getTime();
            myRoom.game_started_at = time;
            // await tableD.save();

            // to track game started time.
            if(start) {
                // Get the current date and time
                const currentDate = new Date();
                // Subtract 3 seconds
                const newDate = new Date(currentDate.getTime() + 3);
                tableD.game_started_at = new Date(newDate).getTime();

                //tableD.game_started_at = new Date().getTime();
                // to log dice value in logdna
                let logData = {
                    level: 'warning',
                    meta: start.table.users
                };
                logDNA.log(`${start.room}_set_0`, logData);
            }
            await redisCache.addToRedis(`table_${params.room}`, tableD);
            // console.log("startIfPossibleTournament Start Time- ", new Date(tableD.game_started_at), tableD.game_started_at)           
            let configGameTime = config.gameTime;
            if('gameTime' in tableD) {
                configGameTime = tableD.gameTime;
            }
            let timeToAdd = new Date(new Date().getTime() + configGameTime * 60000);
            var seconds = (timeToAdd - new Date().getTime()) / 1000;
            // console.log(timeToAdd, new Date().getTime(), seconds)
            // start.timeToCompleteGame = seconds;
            start.timeToCompleteGame = configGameTime * 60;
        }
        return start;
        // let returnStart = false;
        // if (start && start.table && start.table.users && start.table.users.length > 0) {
        //     returnStart = JSON.parse(JSON.stringify(start));
        //     returnStart.table.users.forEach(element => {
        //         delete element.diceValue;
        //         delete element.user_token;
        //     });
        // }
        // return returnStart;
    },

    abortGame: async function (table)
    {
        // let nw = await Table.findOneAndUpdate(
        //     {
        //         room: table.room,
        //     },
        //     {
        //         $set: {
        //             game_completed_at: new Date().getTime(),
        //             players: [],
        //         },
        //     },
        //     {
        //         new: true,
        //     }
        // );
        // console.log('NW DONE', nw);

        await _tab.abortGame(table.room);
    },

    //Check Tabel Exists
    istableExists: async function (params, myRoom) {
        // console.log('Check Tabel Exists Request >> ', params);
        if (!params) {
            // console.log('missingParamError');
            return false;
        }
        if (!params.room) {
            // console.log('missingParamError');
            return false;
        }
        // let myRoom     = await redisCache.getRecordsByKeyRedis(params.room);
        let tabelCheck = _tab.checkTableExists(params.room, myRoom);
        // console.log('Table Exists', tabelCheck);
        return tabelCheck;
    },

    getMyIdByPossition: async function (params, id, myRoom) {
        // console.log('Request to get ID >>', params);
        if (!params) {
            // console.log('missingParamError');
            return false;
        }
        if (!params.room) {
            // console.log('missingParamError');
            return false;
        }

        return await _tab.getMyIdByPosition(params.room, id, myRoom);

    },

    reconnectIfPlaying: async function (id) {
        // console.log('User Playing On Table');
        let roomId = await redisCache.getRecordsByKeyRedis('user_id'+id.toString());

        let myRoom;
        if (roomId) {
            myRoom = await redisCache.getRecordsByKeyRedis(roomId);
        }
        if(myRoom) {
            let logData = {
                level: 'warning',
                meta: { p: 'join_previous', 'user_id' : id, 'room' : myRoom}
            };
            logDNA.warn(`room found at join_previous`, logData);


            let us = myRoom.users.find((ele) => ele.id == id.toString());
            logData = {
                level: 'warning',
                meta: { p: 'join_previous', 'user_id' : id, 'room' : myRoom}
            };
            logDNA.warn(`user found at join_previous`, logData);

            let alreadyPlaying = _tab.alreadyPlayingTable(us.id,myRoom);
            // console.log('join_previous alreadyPlaying- ', JSON.stringify(alreadyPlaying));
            if (alreadyPlaying.status == 1)
            {
                // var tab = await Table.findOne({room: alreadyPlaying.table.room, 'players.id': id});
                let tab = false;
                let table = await redisCache.getRecordsByKeyRedis(`table_${alreadyPlaying.table.room}`);
                if(table){
                    table = table.players.find((ele) => ele.id.toString() == id.toString());
                }
                if (!table)
                {
                    // FIX_2407 : ALREADY PLAYING
                    // console.log('DESTROY', alreadyPlaying.table.room);
                    await _tab.abortGame(alreadyPlaying.table.room);
                    return {
                        status: 0,
                    };
                } else {
                    // console.log(tab)
                    alreadyPlaying.status = 1;
                    return alreadyPlaying;
                }
            }
            else {
                logData = {
                    level: 'warning',
                    meta: { p: 'join_previous', 'user_id' : id, 'room' : myRoom}
                };
                logDNA.warn(`user_id mismatch with myRoom users id`, logData);
                return alreadyPlaying;
            }
        } else {

            let logData = {
                level: 'warning',
                meta: { p: 'join_previous', 'user_id' : id}
            };
            logDNA.warn(`room not found at join_previous`, logData);

            return {
                status: 0,
                message: "An error was encountered. Please join a new game."
            }
        }
    },

    getTokens: async function (room, id, myRoom) {
        if (!Service.validateObjectId(id)) false;
        //let us = await User.findById(id);
        let us = myRoom.users.find((ele) => ele.id == id.toString());
        let alreadyPlaying = _tab.getTokRoom(room, us.id, myRoom);

        // console.log('User Playing On Table', alreadyPlaying);
        return alreadyPlaying;
    },

    sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),

    joinTournamentV2: async function (params, entry_Fee, myId, user, retryCount = 0) {
        params = _.pick(params, ['no_of_players', 'room_fee', 'winningAmount', 'totalWinning', 'lobbyId', 'gameTime', 'turnTime', 'payoutConfig']);
        if (!params || !myId || _.isEmpty(params.no_of_players) || _.isEmpty(params.room_fee)) {
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
        // To check multiple same lobbyId try to join game.
        let isGameStarted = await redisCache.getRecordsByKeyRedis(`table_${params.lobbyId}`);
        if(isGameStarted && isGameStarted.game_started_at !== '-1') {
            return {
                callback: {
                    status: 0,
                    message: 'An error was encountered. Please join a new game.',
                },
            };
        }

        let lobbyAlreadyReceived = await redisCache.incrFromRedis('lobbyIdAtom_'+params.lobbyId);
        if(lobbyAlreadyReceived > 1) {
            this.sleep(1500*lobbyAlreadyReceived);
        }
        let roomId = await redisCache.getRecordsByKeyRedis('lobbyId_'+params.lobbyId);
        let myRoom;
        let tableD;
        if (!roomId && lobbyAlreadyReceived > 1) {
            // console.log("race condition triggered for lobby: " + params.lobbyId);
            for (i = 0; i < 10; i++) {
                // console.log("race condition triggered for value: " + i);
                await this.sleep(1000 * 1);
                roomId = await redisCache.getRecordsByKeyRedis('lobbyId_' + params.lobbyId);
                if (roomId)
                    break;
            }
        }
        if (roomId) {
            myRoom = await redisCache.getRecordsByKeyRedis(roomId);
        }
        
        // redis replacement.
        tableD = await redisCache.getRecordsByKeyRedis(`table_${params.lobbyId}`);

        // if(roomId) {            
        //     tableD = await Table.findOne({
        //         'lobbyId': params.lobbyId,
        //         'room':roomId
        //     });
        // } else {
        //     tableD = await Table.findOne({
        //         'lobbyId': params.lobbyId
        //     });
        // }

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
        let checkTourneyRes = await _tab.checkTournamentTableV2(params.lobbyId, myRoom);
        let isAnyTableEmpty = checkTourneyRes ? checkTourneyRes.room : false;
        let secTime = config.countDownTime;
        if (params.startTime) secTime = Math.round(params.startTime / 1000) - Math.round(new Date().getTime() / 1000) + 5;
        let timerStart = secTime;
        let tableX;
        let room_code;
        if (!isAnyTableEmpty) {
            const DEFAULT_ROOM = 1000000;
            let res = await redisCache.incrFromRedisWithoutTtl('DEFAULT_ROOM');
            if(res <= DEFAULT_ROOM) {
               await redisCache.addToRedisWithoutTtl('DEFAULT_ROOM', DEFAULT_ROOM);
            }

            let room  = res > DEFAULT_ROOM ? res.toString() : DEFAULT_ROOM.toString();

            // let room = await Service.randomNumber(6);
            // let data;
            // while (true) {
            //     data = await Table.find({
            //         room: room,
            //     });

            //     if (data.length > 0) {
            //         room = await Service.randomNumber(6);
            //     }
            //     else {
            //         break;
            //     }
            // }

            if (params) {
                params.win_amount = params.winningAmount;
                params.totalWinning = params.totalWinning;
            }
            params.room = room;
            params.created_at = new Date().getTime();
            params.players = [];
            // let table = new Table(params);
            // tableX = await table.save();
            tableX = await redisCache.addToRedis(`table_${room}`, params);
            if (!tableX) {
                return {
                    callback: {
                        status: 0,
                        message: localization.ServerError,
                    },
                };
            }
            tableX = params;
            room_code = await _tab.createTableforTourney(tableX, entry_Fee);
            await redisCache.addToRedis('room_'+room, 0);
            // console.log('room_' + room_code + ' 0');
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
            // tableX = await Table.findOne({
            //     room: room_code,
            // });
            tableX = await redisCache.getRecordsByKeyRedis(`table_${room_code}`);
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
        // console.log('room_' + room_code + ' ' + valueOfRoom);
        if (valueOfRoom > parseInt(params.no_of_players)) {
            // redisCache.getRecordsByKeyRedis(room_code);
            retryCount++;
            this.joinTournamentV2(params, entry_Fee, myId, user, retryCount);
        }

        myRoom = await redisCache.getRecordsByKeyRedis(room_code);
        let optional = 0;
        var seatOnTable = await _tab.seatOnTableforTourney(room_code, user, optional, myRoom);
        myRoom = seatOnTable.table;
        if (seatOnTable) {
            await redisCache.addToRedis('user_id'+myId, room_code);

            let turnTimer = config.turnTimer;
            let tableData = await redisCache.getRecordsByKeyRedis(`table_${myRoom.room}`);
            if('turnTime' in tableData) { turnTimer = tableData.turnTime; }

            var callbackRes = {
                status: 1,
                message: 'Done',
                table: seatOnTable.table,
                position: seatOnTable.pos,
                timerStart: timerStart,
                default_diceroll_timer: turnTimer // bugg_no_65
            };

            var player = {
                id: user.id,
                token : user.token,
                fees: params.room_fee,
                is_active: true
            };

            let flag = false;
            // console.log('redisdata==>', JSON.stringify(tableX));
            for (let i = 0; i < tableX.players.length; i++) {
                if (tableX.players[i].id.toString() == player.id.toString()) {
                    // console.log("i ->", i, tableX.players[i])
                    tableX.players[i] = player;
                    flag = true;
                    break;
                }
            }

            //Save Player to DB
            if (!flag) tableX.players.push(player);
            tableX.created_at = new Date().getTime();
            //await tableX.save();
           // await redisCache.addToRedis(room_code,myRoom);
            await redisCache.addToRedis(`table_${room_code}`, tableX);
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
            if (retryCount < 3) {
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
    getGameUsersData: async function (data) {

        let userData = data.table.users;
        // console.log("getGameUsersData >", data, userData)
        let reqData = {
            room: data.room,
            amount: data.table.room_fee.toString(),
            users: []
        }
        for (let i = 0; i < userData.length; i++)
        {
            if (userData[i].id != "")
            {              
                let json = {
                    "user_id": userData[i].id,
                    "token": userData[i].user_token,
                }
                reqData.users.push(json)
            }
        }
        return reqData;
    },
    getEndGameData: async function (data, room_fee) {
        let userData = data.game_data;
        let reqData = {
            room: data.room,
            amount:room_fee ? room_fee.toString():'0',
            users: []
        }
        for (let i = 0; i < userData.length; i++) {
            if (userData[i].id != "") {
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
    getDataByRoom: async function (room, myRoom) {
        return _tab.getDataByRoom(room, myRoom);
    },
    // This function used to check equal turn for player.
    checkPlayerEqualTurn: async function (myRoom, playerPosition) {
        //console.log('EqualTurn------>', JSON.stringify(myRoom));
        //console.log('Player Position------>', {playerPosition});
        let foundFirstActiveUser = false;
        let firstActiveUserIndex = 0;
        for (var i = 0; i < myRoom.users.length; i++) {
            if (!myRoom.users[i].hasOwnProperty('is_left')) {
                if (myRoom.users[i].is_active == true
                    && !foundFirstActiveUser) {
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
            if (activeUsers[i].turn < maxTurn) {
                playersFinalTurn.push(activeUsers[i].position);
            } else if (activeUsers[i].turn == maxTurn
                && activeUsers[i].position == currentTurnIndex) {
                playersFinalTurn.push(activeUsers[i].position);
            }
        }
        return { 'totalTurn': maxTurn, 'finalTurn': playersFinalTurn };
    },
    getMyRoomData : async function(myRoom) {
        let dice_rolled = _tab.gePlayerDices(myRoom.room, myRoom.current_turn, myRoom, 'gamePlayData');
        let skippable = _tab.isSkippable(myRoom, dice_rolled[0], myRoom.current_turn);
        return {
            'dice' : dice_rolled[0],
            'skip_dice' : skippable
        }
    },

    /**
     *  Below methods are used only for Ludo Tournament Only
     */

    createTableforTournament : async function(params) {
        // user pawn color setup
        const color = [0, 1, 2, 3];
        const shuffledColor = color.sort(() => 0.5 - Math.random());
        // To generate dice value
        const dice_value = _tab.getCustomizedValue(23, 2);
        // To generate bonus set value
        const bonus_set_one = [];
        for (let index = 0; index < 5; index++) {
            bonus_set_one.push(_tab.generateBonusSetOne());                
        }
        const bonus_set_two = [];
        for (let index = 0; index < 3; index++) {
            bonus_set_two.push(_tab.generateBonusSetTwo());                
        }
        // redis myRoom data
        const myRoom =  {
            room: params.lobbyId,
            created_at: new Date().getTime(),
            room_fee: params.room_fee,
            win_amount: params.totalWinning,
            totalWinning: params.totalWinning,
            payoutConfig: params.payoutConfig,
            players_done: 0,
            players_won: 0,
            current_turn: 0,
            current_turn_type: "roll",
            turn_start_at: 0,
            no_of_players: 4,
            no_of_diceSet: 0,
            users : [],
            lobbyId: params.lobbyId,
            entryFee: params.entryFee,
            isGameCompleted: false,
            turn_time: params.turnTime,
            game_time: params.gameTime,
            timeToCompleteGame: params.gameTime * 60,
            is_it_tournament : true,
            total_turn : 30
        }
        myRoom.users.push({
            id: params.user_id,
            numeric_id: params.user_id,
            name: params.user_name,
            user_token: params.token,
            profile_pic: params.profile_pic,
            lobbyId: params.lobbyId,
            position: 0,
            is_active: true,
            rank: 0,
            life: 3,
            turn: 0,
            tournamentTurn : 0,
            dices_rolled: [],
            bonus_dice: 0,
            six_counts: 0,
            tokens: [0,0,0,0],
            points: 0,
            points_per_diceRoll: [],
            bonusPoints: 0,
            moves: 0,
            bonus_count: 0,
            bonusSet_1: bonus_set_one,
            bonusSet_2: bonus_set_one,
            pawnSafe_status: [true,true,true,true],
            checkpoint: [false,false,false,false],
            token_colour: 1,
            diceValue: dice_value
        },
        {
            id:"fa01",
            numeric_id:"fa01",
            name:"A",
            user_token:"",
            profile_pic:"",
            lobbyId:"",
            position:1,
            is_active:true,
            rank:0,
            life:3,
            turn:0,
            tournamentTurn : 0,
            dices_rolled:[],
            bonus_dice:0,
            six_counts:0,
            tokens: pawnPositions[0],
            points:0,
            points_per_diceRoll:[],
            bonusPoints:0,
            moves:0,
            bonus_count:0,
            bonusSet_1:[],
            bonusSet_2:[],
            pawnSafe_status:[true,true,true,true],
            checkpoint:[false,false,false,false],
            token_colour: 2,
            diceValue:[]
        },
        {
            id:"fa02",
            numeric_id:"fa02",
            name:"B",
            user_token:"",
            profile_pic:"",
            lobbyId:"",
            position:2,
            is_active:true,
            rank:0,
            life:3,
            turn:0,
            tournamentTurn : 0,
            dices_rolled:[],
            bonus_dice:0,
            six_counts:0,
            tokens: pawnPositions[1],
            points:0,
            points_per_diceRoll:[],
            bonusPoints:0,
            moves:0,
            bonus_count:0,
            bonusSet_1:[],
            bonusSet_2:[],
            pawnSafe_status:[true,true,true,true],
            checkpoint:[false,false,false,false],
            token_colour: 3,
            diceValue:[]
        },
        {
            id:"fa03",
            numeric_id:"fa03",
            name:"C",
            user_token:"",
            profile_pic:"",
            lobbyId:"",
            position:3,
            is_active:true,
            rank:0,
            life:3,
            turn:0,
            tournamentTurn : 0,
            dices_rolled:[],
            bonus_dice:0,
            six_counts:0,
            tokens: pawnPositions[2],
            points:0,
            points_per_diceRoll:[],
            bonusPoints:0,
            moves:0,
            bonus_count:0,
            bonusSet_1:[],
            bonusSet_2:[],
            pawnSafe_status:[true,true,true,true],
            checkpoint:[false,false,false,false],
            token_colour: 0,
            diceValue:[]
        });
        await redisCache.addToRedis(myRoom.room, myRoom);
       
        // radis gamePlay data
        const gamePlayData = {
            room: params.lobbyId,
            created_at: new Date().getTime(),
            data : {
                User: params.user_id,
                lobbyId: params.lobbyId,
                turn:1,
                roll:[],
                pawn:0,
                move:0,
                total_move:0,
                cut:0,
                cut_bonus:0,
                home_base:0,
                home_base_bonus:0,
                extra_roll:0,
                extra_roll_count:0,
                extra_roll_reason:[],
                kill_player_data:[],
                pawnSafe_status:[true,true,true,true],
                pawn_move_time:[],
                dice_tap_time:[],
                time_between_tap_and_move:[],
                checkpoint:[false,false,false,false],
                player_score:0,
                points:0,
                points_per_diceRoll:[],
                life_lost:0,
                lives_left:3,
                total_turn : 23,
                pawn_positions:[0,0,0,0],
                game_time:0,
                room_id: params.lobbyId,
                timestamp: new Date().getTime(),
            }
        };
        await redisCache.addToRedis('gamePlay_'+myRoom.room ,gamePlayData);
        // redis table data
        const table = {
            no_of_players: params.no_of_players,
            room_fee: params.room_fee,
            winningAmount: params.room_fee,
            totalWinning: params.totalWinning,
            lobbyId: params.lobbyId,
            gameTime: params.gameTime,
            turnTime: params.turnTime,
            payoutConfig: params.room_fee,
            win_amount: params.payoutConfig,
            room: params.lobbyId,
            created_at: new Date().getTime(),
            players:[{"id":params.user_id, "token":params.token,"fees": params.room_fee,"is_active":true,"rank":0,"pl":0}],
            game_started_at: new Date().getTime(),
            turn_start_at: new Date().getTime(),
            game_completed_at: new Date().getTime(),
            isGameCompleted:false,
            is_it_tournament : true
        }
        await redisCache.addToRedis('table_'+myRoom.room, table);
        return myRoom;
    },

    skipTurnforTournament: async function (params, id, myRoom, gamePlayData) {      
        let turnTimer = config.turnTimer;
        let tableData = await redisCache.getRecordsByKeyRedis(`table_${myRoom.room}`);
        if('turnTime' in tableData) { turnTimer = tableData.turnTime; }        
        if (!params || !params.room) {
            return {
                callback: {
                    status: 0,
                    message: localization.missingParamError,
                    'table': myRoom,
                    'gamePlayData': gamePlayData
                },
            };
        }
        var mypos = await _tab.getMyPosition(params.room, id, myRoom);
        console.log('skip turn position::', id, mypos);
        gamePlayData.data.game_time = await _tab.setGameTime(myRoom);
        if (mypos != -1) {
            var check = await _tab.isCurrentTurnMine(params.room, mypos, myRoom);
            if (check) {
                let deductRes = await _tab.deductLife(params.room, id, myRoom, gamePlayData);
                myRoom = deductRes.table;
                gamePlayData = deductRes.gameData;
                var checkLife = await _tab.getMyLife(params.room, id, myRoom);
                if (checkLife == 0) {
                    //leave table and pass turn to next player
                    var rez = await _tab.leave(params.room, id, myRoom);
                    // console.log('REZ', rez);
                    if (!rez.res) {
                        return {
                            callback: {
                                status: 0,
                                message: localization.ServerError,
                            },
                            'table': myRoom,
                            'gamePlayData': gamePlayData
                        };
                    } else {
                        const userData = [];
                        myRoom.users.map((cur) => {
                            userData.push({
                                "player_index": cur.position,
                                "numeric_id": cur.numeric_id,
                                "id": cur.id,
                                "name": cur.name,
                                "rank": 0,
                                "amount": 0,
                                "is_left": cur.hasOwnProperty('is_left') ? cur.is_left : false,
                                "score": 0
                            });
                        }, [])

                        var rez_finalObj = {
                            callback: {
                                status: 2,
                                message: localization.success,
                            },
                            'table': myRoom,
                            'gamePlayData': gamePlayData,
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
                                    delay: 500,
                                    data: {
                                        room: params.room,
                                        position: rez.position,
                                        game_data: userData
                                    },
                                },
                            ],
                        };
                        //var us = await User.findById(id);
                        let us = myRoom.users.find((ele) => ele.id == id.toString());
                        // console.log("MyRoom====>", myRoom, us);
                        let reqData = {
                            room: params.room,
                            //amount: tableD.room_fee.toString(),
                            amount:myRoom.room_fee ? myRoom.room_fee.toString():'0',
                            users: [{
                                "user_id": us.numeric_id,
                                "token": us.user_token,
                                "isRefund": params.isRefund ? params.isRefund : false
                            }]
                        };
                        await requestTemplate.post(`matchmakingFailed`, reqData);

                            // Check if EndGame Possible
                            // let endGameRes = await _tab.calculateGameEndData(params.room, myRoom.win_amount, myRoom);
                            let endGame = _tab.calculateTurnamentScore(myRoom.current_turn, myRoom);
                            if (endGame)
                            {
                                let tableD = await redisCache.getRecordsByKeyRedis(`table_${params.room}`);
                                if (tableD)
                                {
                                    // console.log(`PL:: <<<<<<<< END GAME >>>>>>>>>`);
                                    // in redis updated isGameCompleted property
                                    myRoom.isGameCompleted = true;
                                    await redisCache.addToRedis(params.room, myRoom);
                                    tableD.game_completed_at = new Date().getTime();
                                    tableD.isGameCompleted   = true;
                                    await redisCache.addToRedis(`table_${params.room}`,tableD);

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
                                await requestTemplate.post(`endgame`, reqData);                            
                                await _tab.sendToSqsAndResetGamePlayData(params.room, myRoom, gamePlayData, mypos);
                            }                        
                            rez_finalObj.table = myRoom;
                            rez.gamePlayData = gamePlayData;
                            return rez_finalObj;
                    }
                } else {
                    var resObj = {
                        callback: {
                            status: 1,
                            message: localization.success,
                        },
                        'table': myRoom,
                        'gamePlayData': gamePlayData,
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
                        // always turn position is 0 
                        let nextPos = 0;
                        console.log('update turn 21');
                        await _tab.updateTournamentTurn(nextPos, 'turn', mypos, 0, myRoom);
                        //console.log("gamePlayData before 1: " + JSON.stringify(gamePlayData));
                        // let dices_rolled = await _tab.gePlayerDices(params.room, nextPos, myRoom, gamePlayData);
                        // let DICE_ROLLED = await _tab.rollDice(params.room, id);

                        //console.log("gamePlayData before 2: " + JSON.stringify(gamePlayData));
                        let DICE_ROLLED_RES = await _tab.rollDice(params.room, nextPos, myRoom);
                        let DICE_ROLLED;
                        if (DICE_ROLLED_RES) {
                            myRoom = DICE_ROLLED_RES.table;
                            DICE_ROLLED = DICE_ROLLED_RES.returnDiceValue;
                        }
                        await _tab.diceRolled(params.room, nextPos, DICE_ROLLED, myRoom, gamePlayData);
                       // console.log("gamePlayData before 3: " + JSON.stringify(gamePlayData));
                        await _tab.sendToSqsAndResetGamePlayData(params.room, myRoom, gamePlayData, mypos);
                        //console.log("gamePlayData before 4: " + JSON.stringify(gamePlayData));
                        let skipDice = _tab.isSkippable(myRoom, DICE_ROLLED, nextPos);
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
                                dices_rolled: [DICE_ROLLED],
                                turn_start_at: turnTimer,
                                extra_move_animation: false,
                                skip_dice: skipDice,
                                turn_timestamp: myRoom.turn_timestamp,
                                server_time: new Date(),
                            },
                        };
                        resObj.events.push(event);
                        resObj.table = myRoom;
                        resObj.gamePlayData = gamePlayData;
                        return resObj;
                    }
            } else {
                return {
                    callback: {
                        status: 0,
                        message: localization.NotYourMoveError,
                    },
                    'table': myRoom,
                    'gamePlayData': gamePlayData
                };
            }
        } else {
            return {
                callback: {
                    status: 0,
                    message: localization.ServerError,
                },
                'table': myRoom,
                'gamePlayData': gamePlayData
            };
        }
    },

    tournamntGameDiceRolled: async function (params, id, myRoom, gamePlayData) {
        // To capture dice tap time.
        if (gamePlayData && gamePlayData.data && gamePlayData.data.dice_tap_time) {
            let diceTapTime = await _tab.setPawnMoveTime(myRoom);
            gamePlayData.data.dice_tap_time.push(diceTapTime);
        }
        
        // To update turn count
        // const response = _tab.updateTurnCount(myRoom, gamePlayData);
        // myRoom = response.table;
        // gamePlayData = response.gamePlayData;

        let isJackpot = false;
        let resObj = { callback: { status: 1, message: localization.success }, events: [] };
        let threeSix = false;
        // VALIDATE PARAMS
        if (!params) return { callback: { status: 0, message: localization.missingParamError } };
        if (!params.room) return { callback: { status: 0, message: localization.missingParamError } };
        // CHECK IF I EXIST IN THIS ROOM
        var myPos = await _tab.getMyPosition(params.room, id, myRoom);
        if (myPos == -1) return { callback: { status: 0, message: localization.noDataFound } };
        let check = await _tab.isCurrentTurnMine(params.room, myPos, myRoom);
        if (!check) {
            return { callback: { status: 0, message: localization.noDataFound } };
        }
        // GET DICE RANDOM
        let DICE_ROLLED = await _tab.getMyDice(params.room, id, myRoom, gamePlayData);
        //console.log('DICE_ROLLED ====>>>>>', DICE_ROLLED);
        if (DICE_ROLLED > 6 || DICE_ROLLED < 0) return { callback: { status: 0, message: localization.noDataFound } };

        resObj.callback.dice = DICE_ROLLED;
        let dices_rolled = await _tab.gePlayerDices(params.room, myPos, myRoom, gamePlayData);
        //console.log("value got ", dices_rolled);
        let verify = dices_rolled.every((val, i, arr) => val === 6)
        //console.log("verify", verify);
        if (verify && dices_rolled.length == 3) {isJackpot = true}
        //dices_rolled = await _tab.gePlayerDices(params.room, myPos, myRoom, gamePlayData);
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
        resObj.callback.skip_dice = false;
        // console.log('EVENT_PUSHED', event);
        resObj.events.push(event);
        var movePossible = await _tab.isMovePossible(params.room, id, myRoom);
        // IF MOVE POSSIBLE FROM CURRENT DICES & Position

        // const jackPOT = await _tab.jackPot(params.room, id, myRoom);
        // let sixCounts = await _tab.getSix(params.room, id, myRoom);
        
        /**
         * To check current dice rolled value is 6 and move not possible. 
         * then user should't get next chance.
         */
        // IF 3 times 6
        let turnTimer = config.turnTimer;
        let tableData = await redisCache.getRecordsByKeyRedis(`table_${myRoom.room}`);
        if('turnTime' in tableData) { turnTimer = tableData.turnTime; }
        
        if (movePossible) {
            // console.log('[MOVE POSSIBLE DICE ROLLED]');
            let timer = 150; // previously it was 500
            let myPos = await _tab.getMyPosition(params.room, id, myRoom);
            //  MAKE_MOVE TO ME
            let nextPos = await _tab.getNextPosition(params.room, myPos, myRoom);
            console.log('update turn 22');
            await _tab.updateTournamentTurn(myPos, 'move', -1, 1, myRoom);            
            let dices_roll = await _tab.gePlayerDices(params.room, myPos, myRoom, gamePlayData);
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
                    turn_start_at: turnTimer,
                    skip_dice: threeSix,
                    turn_timestamp: myRoom.turn_timestamp,
                    server_time: new Date(),
                },
            };
            resObj.events.push(event);
        }
        // ELSE // if both are false // if(!movePossible && !jackPOT)
        if (!movePossible) {
            var myPos = await _tab.getMyPosition(params.room, id, myRoom);
            let DICE_ROLLED_RES = _tab.getRandomDiceValue(myPos, myRoom, gamePlayData);
            let DICE_ROLLED;
            if (DICE_ROLLED_RES) {
                myRoom = DICE_ROLLED_RES.table;
                DICE_ROLLED = DICE_ROLLED_RES.DiceValue;
            }
            console.log('update turn 23');
            await _tab.updateTournamentTurn(myPos, 'turn', -1, 0, myRoom);
            // added below two lines on 11-10-2023
            await _tab.diceRolled(params.room, myPos, DICE_ROLLED, myRoom, gamePlayData);
            gamePlayData.data.game_time = await _tab.setGameTime(myRoom);
            // to add dice skip, bug_no_64, Ex: if 1 pawn is two steps away from home, when i roll a five then the roll will be skipped. So, need a skipped feedback for this case
            resObj.callback.skip_dice = false;
            let skipDice = _tab.isSkippable(myRoom, DICE_ROLLED, myPos);
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
                    dices_rolled: [DICE_ROLLED],
                    turn_start_at: turnTimer,
                    extra_move_animation: true,
                    skip_dice: skipDice,
                    turn_timestamp: myRoom.turn_timestamp,
                    server_time: new Date(),
                },
            };
            resObj.events.push(event);
            

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

    tournamentMoveMade: async function (params, id, gamePlayData, myRoom) {
        // console.log('Move Made', params);
        try {
            // To capture pawn tap time
            let pawnTime = await _tab.setPawnMoveTime(myRoom);
            if (gamePlayData && gamePlayData.data) {
                gamePlayData.data.pawn_move_time.push(pawnTime);

                let pawn_move_time = gamePlayData.data.pawn_move_time;
                let dice_tap_time = gamePlayData.data.dice_tap_time;
                let differences = dice_tap_time.map((time, index) => {
                    let timeInSeconds = parseFloat(time);
                    if(pawn_move_time[index] != undefined) {
                      let pawnTime = parseFloat(pawn_move_time[index] || 0);
                       return (timeInSeconds - pawnTime).toFixed(2);
                    }
                  }).filter((ele) => ele!= undefined);                
                gamePlayData.data.time_between_tap_and_move.push(differences[0]);
            }

            // VALIDATION
            if (!params) {
                return { callback: { status: 0, message: localization.missingParamError } };
            } else if (!params.room) {
                return { callback: { status: 0, message: localization.missingParamError } };
            } else if (!params.token_index) {
                return { callback: { status: 0, message: localization.missingParamError } };
            } else if (!params.dice_value) {
                return { callback: { status: 0, message: localization.missingParamError } };
            } else if (parseInt(params.dice_value) > 6) {
                return { callback: { status: 0, message: localization.missingParamError } };
            }
            params.token_index = parseInt(params.token_index);
            params.dice_value = parseInt(params.dice_value);

            let resObj = { callback: { status: 1, message: localization.success, isKillable: false }, events: [] };
            let myPos = await _tab.getMyPosition(params.room, id, myRoom);
            //if (myPos == -1) return {callback: {status: 0, message: localization.noDataFound}};
            let params_data = {
                room: params.room,
            };
            var checkTabel = await this.istableExists(params_data, myRoom); // added to solve backword token movement 
            if (checkTabel.current_turn != myPos) {
                // console.log("IN moveTourney IF - ", checkTabel, myPos); //to handle token revert issue - NO1-I44
                return;
            }
            let diceVales = [];
            diceVales.push(params.dice_value)
            // const allEqual = diceVales => diceVales.every(v => v === 6);

            let turnTimer = config.turnTimer;
            let tableData = await redisCache.getRecordsByKeyRedis(`table_${myRoom.room}`);
            if('turnTime' in tableData) { turnTimer = tableData.turnTime; }

            // to validate player have passed same value that have in backend.
            let diceValue = await _tab.gePlayerDices(params.room, myPos, myRoom, gamePlayData);
            // console.log('roll skip debugging==>', myPos, diceValue);
            if (diceValue.length !== 0 && params.dice_value !=6 && params.dice_value != diceValue) {
                let nextPos = 0;
                console.log('update turn 24');
                await _tab.updateTournamentTurn(nextPos, 'turn', -1, 0, myRoom);
                let DICE_ROLLED_RES = await _tab.rollDice(params.room, nextPos, myRoom);
                let DICE_ROLLED;
                if (DICE_ROLLED_RES) {
                    myRoom = DICE_ROLLED_RES.table;
                    DICE_ROLLED = DICE_ROLLED_RES.returnDiceValue;
                }
                await _tab.diceRolled(params.room, nextPos, DICE_ROLLED, myRoom, gamePlayData);
                // console.log('[DICE VALUE SIX]', DICE_ROLLED);
              //  await _tab.diceRolled(params.room, myPos, DICE_ROLLED, myRoom, gamePlayData);
                // let dices_rolled = await _tab.gePlayerDices(params.room, nextPos, myRoom, gamePlayData);
                // console.log('[DICE VALUE SIX]', dices_rolled, myPos);
                // SEND EVENT
                let skipDice = _tab.isSkippable(myRoom, DICE_ROLLED, nextPos);
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
                        dices_rolled: [DICE_ROLLED],
                        turn_start_at: turnTimer,
                        extra_move_animation: false,
                        skip_dice: skipDice,
                        turn_timestamp: myRoom.turn_timestamp,
                        server_time: new Date(),
                    },
                };
                resObj.events.push(event);
                gamePlayData.data.game_time = await _tab.setGameTime(myRoom);
                let user_points = 0;
                gamePlayData.data.points_per_diceRoll.map(function (ele) {
                    user_points += ele;
                });
                gamePlayData.data.points = user_points + (+gamePlayData.data.total_move);
                gamePlayData.data.player_score = myRoom.users[myPos].points + myRoom.users[myPos].bonusPoints;
                await _tab.sendToSqsAndResetGamePlayData(params.room, myRoom, gamePlayData, myPos);
                let logData = {
                    level: 'error',
                    meta: { 'env': `${process.env.NODE_ENV}`, 'params': params,"diceValue":diceValue ,"position":myPos}
                };
                logDNA.error('In tournamentGame pawn move attempt to do fraud', logData);
                return resObj;
            }
            // Check if move is possible
            var movePossibleExact = _tab.isMovePossibleExact(
                params.dice_value,
                params.room,
                id,
                params.token_index,
                myRoom
            );
            if (!movePossibleExact) {

                let nextPos = 0;
                //await _tab.updateCurrentTurn(params.room, myPos, 'roll', -1, 0,myRoom);
                console.log('update turn 26');
                await _tab.updateTournamentTurn(nextPos, 'turn', myPos, 0, myRoom);
                let DICE_ROLLED_RES = await _tab.rollDice(params.room, nextPos, myRoom);
                let DICE_ROLLED;
                if (DICE_ROLLED_RES) {
                    myRoom = DICE_ROLLED_RES.table;
                    DICE_ROLLED = DICE_ROLLED_RES.returnDiceValue;
                }
                await _tab.diceRolled(params.room, nextPos, DICE_ROLLED, myRoom, gamePlayData);
                let skipDice = _tab.isSkippable(myRoom, DICE_ROLLED, nextPos);
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
                        dices_rolled: [DICE_ROLLED],
                        turn_start_at: turnTimer,
                        extra_move_animation: false,
                        skip_dice: skipDice,
                        turn_timestamp: myRoom.turn_timestamp,
                        server_time: new Date(),
                    },
                };
                resObj.events.push(event);
                
                // update the gamePlay data at the time of skip happen for non moveble event.
                gamePlayData.data.game_time = await _tab.setGameTime(myRoom);
                let user_points = 0;
                gamePlayData.data.points_per_diceRoll.map(function (ele) {
                    user_points += ele;
                });
                gamePlayData.data.points = user_points + (+gamePlayData.data.total_move);
                gamePlayData.data.player_score = myRoom.users[myPos].points + myRoom.users[myPos].bonusPoints;
                await _tab.sendToSqsAndResetGamePlayData(params.room, myRoom, gamePlayData, myPos);

            } else {
                // console.log('[MOVE POSSIBLE EXACT]');
                let moveBonusCheck = true;
                // Make move, Remove dicevalue & get CURRENT_POSITION of token
                var resp = await _tab.makeMoveForTournament(params.dice_value, params.room, id, params.token_index, myRoom, gamePlayData);
                myRoom = resp.table;
                gamePlayData = resp.gamePlayData;
                var token_position = resp.token_position;
                let dices_rolled = await _tab.gePlayerDices(params.room, myPos, myRoom, gamePlayData);
                //console.log('TOK POS----', token_position, dices_rolled);
                let checkPointActivated = _tab.checkPointActive(params.room, myPos, myRoom, gamePlayData);
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
                        isKillable: false,
                        // safeZoneAnimation:checkPointActivated, 
                        // homeAnimation: homeAnimation
                    },
                };
                resObj.events.push(moveMadeEvent);

                var killed = false;
                let killTimer = 4000;
                // if CURRENT_POSITION == 56
                if (token_position == 56) { 
                    // Add extra Bonus Roll
                    await _tab.addBonus(params.room, id, 1, "Home", myRoom, gamePlayData); 
                    // Check if allHome
                    const allHomeRes = _tab.allHome(params.room, id, myRoom);
                    let allHome = allHomeRes
                    if (allHomeRes) {
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
                        let endGame = _tab.calculateTurnamentScore(myRoom.current_turn, myRoom);
                        if (endGame)
                        {
                            let tableD = await redisCache.getRecordsByKeyRedis(`table_${params.room}`);
                            // Update values in user wallets & table data [DB]
                            if (tableD) {
                                // in redis updated isGameCompleted property
                                myRoom.isGameCompleted = true;
                                await redisCache.addToRedis(params.room, myRoom);
                                tableD.game_completed_at = new Date().getTime();
                                tableD.isGameCompleted   = true;
                                await redisCache.addToRedis(`table_${params.room}`,tableD);
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
                            // console.log("END-GAME-DATA-1", reqData);
                            await requestTemplate.post(`endgame`, reqData);
                            // send 
                            let user_points = 0;
                            gamePlayData.data.points_per_diceRoll.map(function (ele) {
                                user_points += ele;
                            });
                            gamePlayData.data.player_score += user_points;
                            gamePlayData.data.points += user_points;
                            await _tab.sendToSqsAndResetGamePlayData(params.room, myRoom, gamePlayData, myPos);
                            return resObj;
                        }
                        // Else [!endGame]
                        else {
                            //  SCRAP CURRENT DICES & PASS NEXT DICE_ROLL
                            let sixCounts = await _tab.setSix(params.room, id, myRoom);
                            // console.log("set six...2")
                            await _tab.scrapTurn(params.room, myPos, myRoom);
                            // DICE_ROLL TO NEXT
                            let nextPos = 0;
                            console.log('update turn 27');
                            await _tab.updateTournamentTurn(nextPos, 'turn', myPos, 0, myRoom);
                            let dices_rolled = await _tab.gePlayerDices(params.room, nextPos, myRoom, gamePlayData);
                            let DICE_ROLLED_RES = await _tab.rollDice(params.room, nextPos, myRoom);
                            let DICE_ROLLED;
                            if (DICE_ROLLED_RES) {
                                myRoom = DICE_ROLLED_RES.table;
                                DICE_ROLLED = DICE_ROLLED_RES.returnDiceValue;
                            }
                            await _tab.diceRolled(params.room, nextPos, DICE_ROLLED, myRoom, gamePlayData);
                            await _tab.sendToSqsAndResetGamePlayData(params.room, myRoom, gamePlayData, myPos);
                            let skipDice = _tab.isSkippable(myRoom, DICE_ROLLED, nextPos);
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
                                    dices_rolled: [DICE_ROLLED],
                                    turn_start_at: turnTimer,
                                    extra_move_animation: false,
                                    skip_dice: skipDice,
                                    turn_timestamp: myRoom.turn_timestamp,
                                    server_time: new Date(),
                                },
                            };
                            resObj.events.push(event);
                        }
                    }
                    // Else [!allHome]
                    else {
                        moveBonusCheck = true;
                    }
                }
                // Else [!56]
                else {
                    // console.log('[BEFORE NOT HOME]');
                    // Check If Killing Possible (Kill & Get Tokens)
                    // 
                    // console.log("can i kill true.........")
                    try {
                        // console.log('gamePlayDatNew: ' + JSON.stringify(gamePlayData));

                        var canIKillRes = await _tab.CanIKill(params.room, id, params.token_index, myPos, myRoom, gamePlayData);
                        myRoom = canIKillRes.myRoom;
                        gamePlayData = canIKillRes.gameData;
                        let canIKill = canIKillRes.dead_possible;
                        if (canIKill) {
                            // console.log("canIKill true:::", canIKill[0])
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
                                if (resObj.events[index].name == 'move_made') {
                                    resObj.events[index].data.isKillable = true;
                                }
                            }

                            resObj.events.push(event);
                            // Add Bonus as much as Killed Token Length
                            if (canIKill.length >= 1) {
                                await _tab.addBonus(params.room, id, 1, "Kill", myRoom, gamePlayData);
                            }
                            // _tab.addBonus(params.room, id, canIKill.length, "Kill");                            
                            await _tab.addBonusPoints(params.room, id, 20, canIKill.length, 'cut_bonus', myRoom, gamePlayData);
                            killed = true;
                        }                          
                        // Else [!canIKill]
                        moveBonusCheck = true;
                    } catch (err) {
                        let logData = {
                            level: 'error',
                            meta: { 'env': `${process.env.NODE_ENV}`, 'error': err, 'params': params, 'room': myRoom, stackTrace: err.stack }
                        };
                        logDNA.error('tournament_game_moveTourney_2', logData);
                    }
                }

                // console.log('BONUS', moveBonusCheck);
                // IF moveBonusCheck
                if (moveBonusCheck) {
                    let movePossible = await _tab.isMovePossible(params.room, id, myRoom);
                    let timer = 1500; //1500;
                    if (killed) timer = killTimer;//4000 //nostra 3000
                    // If Move Possible
                    if (movePossible) {
                        //  MAKE_MOVE TO ME
                        console.log('update turn 28');
                        await _tab.updateTournamentTurn(myPos, 'move', -1, 0, myRoom);
                        setTimeout(function () {
                            _tab.updateCurrentTime(params.room, myRoom);
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
                                turn_start_at: turnTimer,
                                turn_timestamp: myRoom.turn_timestamp,
                                server_time: new Date(),
                            },
                        };
                        resObj.events.push(event);
                    }
                    // Else [!movePossible]
                    else {
                        // console.log("set six...3")
                        _tab.scrapTurn(params.room, myPos, myRoom);
                        // Check If Bonus Pending
                        let pendingBonus = await _tab.getBonus(params.room, id, myRoom);
                        // console.log('GET BONUS', pendingBonus);
                        if (pendingBonus > 0) {
                            // console.log("in the SCRAP TURNB 11");
                            // Deduct Bonus
                            await _tab.useBonus(params.room, id, myRoom);
                            // Send 'roll' to same player
                            console.log('update turn 29');
                            // ****Not increasing the turn count when bonus roll given
                            await _tab.updateTournamentTurn(myPos, 'turn', -1, 0, myRoom);
                            setTimeout(function () {
                                _tab.updateCurrentTime(params.room, myRoom); /// to solve early leave deduction on token kill
                            }, timer)
                            let dices_rolled = await _tab.gePlayerDices(params.room, myPos, myRoom, gamePlayData);
                            // let DICE_ROLLED = _tab.rollDice(params.room, id);
                            let DICE_ROLLED_RES = _tab.getRandomDiceValue(myPos, myRoom, gamePlayData);
                            let DICE_ROLLED;
                            if (DICE_ROLLED_RES) {
                                myRoom = DICE_ROLLED_RES.table;
                                DICE_ROLLED = DICE_ROLLED_RES.DiceValue;
                                // console.log(JSON.stringify(myRoom));
                            }
                            // console.log('Six skip debugging...', myPos, DICE_ROLLED);
                            await _tab.diceRolled(params.room, myPos, DICE_ROLLED, myRoom, gamePlayData);
                            // SEND EVENT
                            let skipDice = _tab.isSkippable(myRoom, DICE_ROLLED, myPos);
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
                                    dices_rolled: [DICE_ROLLED],
                                    turn_start_at: turnTimer,
                                    extra_move_animation: true,
                                    skip_dice: skipDice,
                                    turn_timestamp: myRoom.turn_timestamp,
                                    server_time: new Date(),
                                },
                            };
                            resObj.events.push(event);
                        }
                        // Else [!BonusPending]
                        else {
                            // If no pending dice roll then reset the six counter.
                            await _tab.setSix(params.room, id, myRoom);
                            await _tab.scrapTurn(params.room, myPos, myRoom);
                            let nextPos = 0;
                            console.log('update turn 30');
                            await _tab.updateTournamentTurn(nextPos, 'turn', myPos, 0, myRoom);
                            let dices_rolled = await _tab.gePlayerDices(params.room, nextPos, myRoom, gamePlayData);
                            // let DICE_ROLLED = await _tab.rollDice(params.room, id);
                            let DICE_ROLLED_RES = await _tab.rollDice(params.room, nextPos, myRoom);
                            let DICE_ROLLED;
                            if (DICE_ROLLED_RES) {
                                myRoom = DICE_ROLLED_RES.table;
                                DICE_ROLLED = DICE_ROLLED_RES.returnDiceValue;
                            }
                            await _tab.diceRolled(params.room, nextPos, DICE_ROLLED, myRoom, gamePlayData);
                            // Update player_score and player_points in gamePlayData
                            // SEND EVENT
                            let user_points = 0;
                            gamePlayData.data.points_per_diceRoll.map(function (ele) {
                                user_points += ele;
                            });
                            gamePlayData.data.points = user_points + (+gamePlayData.data.total_move);
                            gamePlayData.data.player_score = myRoom.users[myPos].points + myRoom.users[myPos].bonusPoints;
                            await _tab.sendToSqsAndResetGamePlayData(params.room, myRoom, gamePlayData, myPos);
                            // SEND EVENT
                            let skipDice = _tab.isSkippable(myRoom, DICE_ROLLED, nextPos);
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
                                    dices_rolled: [DICE_ROLLED],
                                    turn_start_at: turnTimer,
                                    extra_move_animation: false,
                                    skip_dice: skipDice,
                                    turn_timestamp: myRoom.turn_timestamp,
                                    server_time: new Date(),
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
            let logData = {
                level: 'error',
                meta: { 'env': `${process.env.NODE_ENV}`, 'error': err, 'params': params, 'room': myRoom, stackTrace: err.stack }
            };
            logDNA.error('tournament_game_moveTourney_3', logData);
        }
    },

    checkwinnerOfTournament_V2: async function (room,myRoom)
    {
        let tableD = await redisCache.getRecordsByKeyRedis(`table_${room}`);
        if (tableD)
        {
            endGame = _tab.calculateTurnamentScore(myRoom.current_turn, myRoom);
            if (endGame) {
                // in redis updated isGameCompleted property
                myRoom.isGameCompleted = true;
                await redisCache.addToRedis(room, myRoom);
                tableD.game_completed_at = new Date().getTime();
                tableD.isGameCompleted = true;
                await redisCache.addToRedis(`table_${room}`, tableD);
                // Update values in user wallets & table data [DB]
                let event = {
                    type: 'room_including_me',
                    room: room,
                    delay: 2000,
                    name: 'end_game',
                    data: {
                        room: room,
                        game_data: endGame,
                    },
                };
                let reqData = await this.getEndGameData(event.data, myRoom.room_fee);
                // console.log("END-GAME-DATA-2", reqData);
                await requestTemplate.post(`endgame`, reqData);
                //return event;
                let resObj = {
                    'events': [],
                    'table': myRoom
                };

                resObj.events.push(event);
                return resObj;
            }    
        }
    },

    tournamentStartPossible: async function (params, myRoom, gamePlayData)
    {
        if (!params) return false;
        if (!params.room) return false;
        let start = await _tab.tournamentStartGame(params.room, myRoom, gamePlayData);
        console.log('AFTER START ==>', JSON.stringify(start));
        let tableD = await redisCache.getRecordsByKeyRedis(`table_${params.room}`);
        if (tableD)
        {
            // if game start & move happend at tie time then
            let currentData = new Date();
            // currentData.setSeconds(currentData.getSeconds() - 1);
            currentData.setSeconds(currentData.getSeconds() + 7);
            let time = new Date(currentData).getTime();
            tableD.game_started_at = '-1';
            let turnTime = new Date();
            const newTurnTime = new Date(turnTime.getTime() + 8);
            tableD.turn_start_at = new Date(newTurnTime).getTime();
            // tableD.turn_start_at = new Date().getTime();
            myRoom.game_started_at = time;
            // to track game started time.
            if(start) {
                // Get the current date and time
                const currentDate = new Date();
                // Subtract 3 seconds
                const newDate = new Date(currentDate.getTime() + 8);
                tableD.game_started_at = new Date(newDate).getTime();
                // to log dice value in logdna
                let logData = {
                    level: 'warning',
                    meta: start.table.users
                };
                logDNA.log(`${start.room}_tournament_set_0`, logData);
            }
            await redisCache.addToRedis(`table_${params.room}`, tableD);          
            let configGameTime = config.gameTime;
            if('gameTime' in tableD) {
                configGameTime = tableD.gameTime;
            }
            start.timeToCompleteGame = configGameTime * 60;
        }
        return start;
    }
};
