const config        = require('./../../config');
var {tableObject, gamePlayObject} = require('./tableObject');
const {sendMessage} = require('../../socket/controller/message_controllers');
const logDNA        = require('../../api/service/logDNA');
const timeLib       = require('../helper/timeLib');
const redisCache    = require('../../api/service/redis-cache');
// const Table         = require('./../../api/models/table');
let logger          = {};
class _Tables
{
    constructor()
    {
        this.tables = tableObject;
        this.gamePlayData = gamePlayObject;
    }
    //create table for tournament
    async createTableforTourney(table,entry_Fee)
    {
        let playData = {
            room: table.room,
            created_at: table.created_at,
            data: {}
        };
        await redisCache.addToRedis('gamePlay_'+table.room, playData);
        // this.gamePlayData.push(playData);
        return new Promise(async(resolve) =>
        {
            let table_i = {
                room: table.room,
                created_at: table.created_at,
                room_fee: table.room_fee,
                win_amount: table.win_amount,
                totalWinning: table.totalWinning,
                players_done: 0,
                players_won: 0,
                current_turn: 0,
                current_turn_type: 'roll',
                turn_start_at: 0,
                no_of_players: table.no_of_players,
                no_of_diceSet : 0,
                users: [],
                lobbyId: table.lobbyId,
                entryFee : entry_Fee,
                isGameCompleted : false,

            };
            let colour = [0, 1, 2, 3];
            // To setup prior dice value for users.
            let randomRumber;
            let randomRumberNew;
            let shuffleNumberForOtherPlayer;
            let shuffleNumberForOther;

            let dice_range;
            (table.no_of_players == 2) ? (dice_range = Math.floor(Math.random() * (25 - 22)) + 22) : (dice_range = Math.floor(Math.random() * (22 - 15)) + 15);
           
            let min_no_of_occurance;

            if(table.no_of_players == 2) {
                min_no_of_occurance = 2;
            } else {
                min_no_of_occurance = 1;
            }
            // switch (table.no_of_players) {
            //     case '2':
            //         min_no_of_occurance = 2;
            //         break;
            //     case '4':
            //         min_no_of_occurance = 1;
            //         break;
            //     default:
            //         break;
            // }
            const original_dice_value = this.getCustomizedValue(dice_range, min_no_of_occurance);
            const previousSequences = new Set();
            for (var pl = 0; pl < 4; pl++)
            {
                let random_number = Math.floor(Math.random() * colour.length);
                let random_colour = colour[random_number];
                colour.splice(random_number, 1);
                // To generate random dice value range between 10 - 20
                const random = Math.floor(Math.random() * (20 - 10)) + 10;
                // To setup random number to 0 position index user.
                if(pl == 0) {
                    //randomRumberNew = this.generateUniqueShuffledSequence(original_dice_value, previousSequences);
                    randomRumber = this.rearrangeArrayWithoutConsecutiveRepeats(original_dice_value);
                } else {
                    console.log('input else part', original_dice_value);
                    //shuffleNumberForOther = this.generateUniqueShuffledSequence(original_dice_value, previousSequences);
                    shuffleNumberForOtherPlayer = this.rearrangeArrayWithoutConsecutiveRepeats(original_dice_value);
                    console.log('output else part', shuffleNumberForOtherPlayer);
                }                
                table_i.users[pl] = {
                    id: '',
                    numeric_id: '',
                    name: '',
                    profile_pic: '',
                    lobbyId : '',
                    position: pl,
                    is_active: false,
                    is_done: false,
                    is_left: false,
                    is_joined: false,
                    rank: 0,
                    life: 3,
                    turn: 1,
                    dices_rolled: [],
                    bonus_dice: 0,
                    six_counts: 0,
                    tokens: [0, 0, 0, 0],
                    points: 0,
                    points_per_diceRoll: [],
                    bonusPoints: 0,
                    moves: 0,
                    pawnSafe_status : [true, true, true, true],
                    checkpoint : [false, false, false, false],
                    token_colour: random_colour,
                    diceValue : pl == 0 ? JSON.parse((JSON.stringify(randomRumber))) : JSON.parse((JSON.stringify(shuffleNumberForOtherPlayer)))
                };
            }
            await redisCache.addToRedis(table.room, table_i);
            //this.tables.push(table_i);
            resolve(table_i.room);
        });
    }

    checkTournamentTable(room_fee, no_of_players)
    {
        // new modification equivalent to above code.
        let count, noPlayers, room = 0;
        this.tables.reduce(function (accumulator, currentValue)
        {
            if (currentValue.room_fee == room_fee && currentValue.no_of_players == no_of_players)
            {
                noPlayers = currentValue.no_of_players;
                count = currentValue.users.filter(users => users.is_active === true).length;
                room = currentValue.room;
            }
            accumulator.push(currentValue);
            return accumulator;
        }, []);
        if (count < noPlayers) return {room: room, timerStart: 60};

        return false;
    }    

    checkTournamentTableV2(lobbyId,myRoom) {
        let count, noPlayers, room = 0;
        if(!myRoom) return false;
        if (myRoom.lobbyId == lobbyId) {
            noPlayers = myRoom.no_of_players;
            count = myRoom.users.filter(users => users.is_active === true).length;
            room = myRoom.room;
        }
        if (count < noPlayers) return { room: room, timerStart: 60 };
        return false;
    }

    //Check Table Exists
    checkTableExists(room, myRoom)
    {
        if(myRoom) {
            let res = {
                    status: true,
                    start_at: parseInt(myRoom.turn_start_at),
                    current_turn: myRoom.current_turn,
                };
                return res;
        }
        return false;
    }

    //Seat on tournament table
    seatOnTableforTourney(room, user, optional, myRoom)
    {
        let filteredTable = myRoom;
        if (filteredTable)
        {
            let count = 0;
            let noPlayers = filteredTable.no_of_players;
            // adding two property for gameData.
            filteredTable.turn_time = config.turnTimer;
            filteredTable.timeToCompleteGame = config.gameTime * 60;
            for (var pl = 0; pl < 4; pl++)
             if (filteredTable.users[pl] && filteredTable.users[pl].is_active) 
                 count++;

            if (count >= noPlayers) return false;

            let pos = -1;
            if (!filteredTable.users[0].is_active)
            {
                pos = 0;
            } else if (!filteredTable.users[2].is_active)
            {
                pos = 2;
            } else if (!filteredTable.users[1].is_active)
            {
                pos = 1;
            } else if (!filteredTable.users[3].is_active)
            {
                pos = 3;
            }

            if (pos == -1) return false;
            let readDiceValue = filteredTable.users[pos].diceValue;
            filteredTable.users[pos] = {
                id: user.id,
                numeric_id: user.numeric_id,
                name: user.name,
                user_token : user.token,
                profile_pic: user.profilepic || config.default_user_pic,
                lobbyId : user.lobbyId,
                position: pos,
                is_active: true,
                rank: 0,
                life: 3,
                turn: 0,
                dices_rolled: [],
                bonus_dice: 0,
                six_counts: 0,
                tokens: [0, 0, 0, 0],
                points: 0,
                points_per_diceRoll : [],
                bonusPoints: 0,
                moves: 0,
                pawnSafe_status : [true, true, true, true],
                checkpoint : [false, false, false, false],
                token_colour: filteredTable.users[pos].token_colour,
                diceValue : readDiceValue
            };
            // console.log('Random dice value', JSON.stringify(filteredTable));
            return {
                table: filteredTable,
                pos: pos,
            };
        }
        return false;
    }

    alreadyPlayingTable(id, myRoom)
    {
        // for logDNA logger
        logger = {
            level: 'debugg',
            meta: this.tables
        };
        logDNA.log('If already playing This.tables', logger);

            for (var pl = 0; pl < myRoom.users.length; pl++)
            {
                if (myRoom.users[pl].id)
                {
                    if (myRoom.users[pl].id.toString() == id.toString() && !myRoom.users[pl].is_left)
                    {
                        // console.log('You are playing on this table', this.tables[i]);

                        var curr_ = new Date().getTime();
                        var diff = (curr_ - myRoom.turn_start_at) / 1000;
                        var diff_ = (curr_ - myRoom.created_at) / 1000;
                        var diffT = (curr_ - myRoom.game_started_at) / 1000;
                        let timeToAdd = config.gameTime * 60;
                        // let gamecompleteTime = timeToAdd.getTime() - curr_ ;
                        // console.log('[alreadyPlayingTable]- ', curr_, myRoom.turn_start_at, 30 - diff, timeToAdd, diffT, timeToAdd - diffT);
                        var rez = {
                            status: 1,
                            table: myRoom,
                            turn_start_at: config.turnTimer - diff,//10 - diff,
                            timerStart: 60 - diff_,
                            game_started: !(myRoom.turn_start_at == 0),
                            current_turn: myRoom.current_turn,
                            current_turn_type: myRoom.current_turn_type,
                            position: myRoom.users[pl].position,
                            dices_rolled: myRoom.users[myRoom.current_turn].dices_rolled,
                            // timeToCompleteGame: timeToAdd + 8 - diffT,
                            timeToCompleteGame: timeToAdd,
                            default_diceroll_timer: config.turnTimer - diff // bug_no_ 65
                        };
                        return rez;
                    }
                }
            }
        var rez = {
            status: 0,
            message: "An error was encountered. Please join a new game."
        };
        return rez;
    }

    getTokRoom(room, id, myRoom)
    {
        let table = myRoom;
                for (var pl = 0; pl < table.users.length; pl++)
                {
                    if (table.users[pl].id)
                    {
                        if (
                            table.users[pl].id.toString() == id.toString() &&
                            !table.users[pl].is_left
                        )
                        {
                            var rez = {
                                status: 1,
                                tokens: table.users.map((user) =>
                                {
                                    return {
                                        user_id: user.id,
                                        tokens: user.tokens,
                                    };
                                }),
                            };
                            return rez;
                        }
                    }
                }
        var rez = {
            status: 0,
        };
        return rez;
    }

    isRankOccupied(room, rank, myRoom)
    {
        var startDate = new Date();
        // var my_tab = this.tables.find((d) => d.room == room);
        let my_tab = myRoom;
        // console.log("table finding time in isRankOccupied", ((new Date()) - startDate));

        return my_tab.users.some((u) => u.rank == rank);
    }

    //Leave Room
    async leave(room, id, myRoom)
    {   
        if(!myRoom) {
            return {
            res: false,
        };
        }
        for (var pl = 0; pl < myRoom.users.length; pl++)
        {
            if (myRoom.users[pl].id.toString() == id.toString())
            {
                // console.log('USER FOUND');
                if (myRoom.turn_start_at == 0)
                {
                    myRoom.users[pl] = {
                        id: '',
                        numeric_id: '',
                        name: '',
                        profile_pic: '',
                        position: pl,
                        is_active: false,
                        is_done: false,
                        is_left: false,
                        rank: 0,
                        life: 0,
                        dices_rolled: [],
                        bonus_dice: 0,
                        six_counts: 0,
                        tokens: [0, 0, 0, 0],
                    };

                    var count = 0;
                    for (var k = 0; k < 4; k++)
                    {
                        if (myRoom.users[k] && myRoom.users[k].is_active)
                        {
                            count++;
                        }
                    }

                    return {
                        res: false,
                        flag: 1,
                        remove: count == 0,
                    };
                }
                myRoom.users[pl].life = 0;
                if (!myRoom.users[pl].is_done)
                {
                    myRoom.users[pl].is_left = true;
                    myRoom.users[pl].is_done = true;
                    myRoom.users[pl].left_time = await this.checkGameExpireTime(myRoom);

                    let rank = myRoom.no_of_players;

                    while (this.isRankOccupied(room, rank, myRoom))
                    {
                        rank--;
                        if (rank == 1) break;
                    }

                    myRoom.users[pl].rank = rank;

                    if(myRoom.players_done)
                    {
                        myRoom.players_done += 1;
                    }
                    else
                        myRoom.players_done=1;

                    // console.log('Players done: '+ myRoom.players_done);
                    return {
                        res: true,
                        position: pl,
                        rank: rank,
                    };
                } else
                {
                    myRoom.users[pl].is_left = true;
                    myRoom.users[pl].left_time = await this.checkGameExpireTime(myRoom);
                    return {
                        res: true,
                        position: pl,
                        rank: myRoom.users[pl].rank,
                    };
                }
            }
        }
        return {
            res: false,
        };
    }


    async checkGameExpireTime(myRoom) {
        if(myRoom.game_started_at) {     
            let gameStartTime = myRoom.game_started_at;
            // To convert New Date() getTime to Second.
            let timeInsecond = (new Date().getTime() / 1000) - (gameStartTime / 1000);
            if (timeInsecond < 0) timeInsecond = 0;
            let timer = config.gameTime * 60 - timeInsecond;
            if(timer < 0){
                timer = 0.0;
            }
            return Math.round((timer + Number.EPSILON) * 100) / 100;
        } else {
            return 0.0;
        }
    }

    //Start Game
    async tournamentStartGame(room, myRoom, gamePlayData)
    {
                var canStart = await this.canStartGame(myRoom);
                if (!canStart) return false;
                var dt = new Date();
                dt.setSeconds(dt.getSeconds() + 4);
                for (let pl = 0; pl < myRoom.users.length; pl++)
                {
                    if (myRoom.users[pl].is_active)
                    {
                        // if game start & move happend at tie time then
                        let currentData = new Date();
                        currentData.setSeconds(currentData.getSeconds()-1);
                        let time = new Date(currentData).getTime();

                        myRoom.current_turn = pl;
                        myRoom.current_turn_type = 'roll';
                        myRoom.turn_start_at = new Date().getTime(); //new Date().getTime();
                        myRoom.game_started_at = time;
                        myRoom.server_time = new Date();
                        //let DICE_ROLLED_RES = this.rollDice(room, myRoom.users[pl].id, myRoom);
                        let DICE_ROLLED_RES = this.rollDice(room, pl, myRoom);
                        //console.log('DICE_ROLLED_RES >>', JSON.stringify(DICE_ROLLED_RES));
                        let DICE_ROLLED;
                        if(DICE_ROLLED_RES) {
                            myRoom = DICE_ROLLED_RES.table;
                            DICE_ROLLED = DICE_ROLLED_RES.returnDiceValue;
                        }
                        myRoom.users[pl].turn = 1;         
                        
                        myRoom.users[pl].dices_rolled = [];
                        myRoom.users[pl].dices_rolled.push(DICE_ROLLED);

                        var resObj = {
                            status: 1,
                            message: 'Done',
                            room: myRoom.room,
                            table: myRoom,
                            dice: DICE_ROLLED,
                            turn_start_at: config.turnTimer,
                            turn_timestamp : new Date(),
                            possition: pl,
                            default_diceroll_timer: config.turnTimer // bug_no_65
                        };
                        this.sendToSqsAndResetGamePlayData(room,myRoom,gamePlayData,pl);
                        return resObj;
                    }
                }

        return false;
    }

    //Abort Game
    async abortGame(room)
    {
        // for (var i = 0; i < this.tables.length; i++)
        // {
        //     if (this.tables[i].room == room)
        //     {
        //         this.tables.splice(i, 1);
        //         console.log('SPLICED', this.tables);
        //     }
        // }

        return true;
    }

    //Can Start Game?
    async canStartGame(myRoom)
    {
        var players = 0;
        for (let pl = 0; pl < myRoom.users.length; pl++)
        {
            if (myRoom.users[pl].is_active) players++;
        }

        if (players == myRoom.no_of_players) return true;
        else return false;
    }

    diceRolled(room, pos, DICE_ROLLED, myRoom)
    {
        if(pos > -1)
        {
            if (myRoom.users[pos].dices_rolled.length > 0) 
                myRoom.users[pos].dices_rolled = [];
            myRoom.users[pos].dices_rolled.push(DICE_ROLLED);
        }
    }

    getBonus(room, id, myRoom)
    {
        //const table = this.tables.find((elem) => elem.room == room);

        if (!myRoom) return 0;

        const me = myRoom.users.find((elem) => elem.id == id);
        if (!me) return 0;
        else return me.bonus_dice;
    }

    useBonus(room, id, myRoom)
    {
        for (let j = 0; j < myRoom.users.length; j++)
        {
            if (myRoom.users[j].id == id)
            {
                if (myRoom.users[j].bonus_dice > 0) {
                    myRoom.users[j].bonus_dice--;
                }
            }
        }
            
    }

    addBonus(room, id, length, type, myRoom, gamePlayData)
    {
        for (let j = 0; j < myRoom.users.length; j++)
        {
            if (myRoom.users[j].id == id)
            {
                myRoom.users[j].bonus_dice += length;
                gamePlayData.data.extra_roll = 1;
                gamePlayData.data.extra_roll_count += 1;
                gamePlayData.data.extra_roll_reason.push(type)
            }
        }
    }

    addBonusPoints(room, id, points, length, type, myRoom, gamePlayData)
    {
        let bonusPoint = points * length;
        for (let j = 0; j < myRoom.users.length; j++)
        {
            if (myRoom.users[j].id == id)
            {
                myRoom.users[j].bonusPoints += bonusPoint;
                gamePlayData.data.points_per_diceRoll.push(bonusPoint);
                // To update pawn kill count per user
                if(type == 'cut_bonus'){
                    if(myRoom.users[j].hasOwnProperty('pawnKillCount')){
                        myRoom.users[j].pawnKillCount = myRoom.users[j].pawnKillCount + 1;
                    } else {
                        myRoom.users[j].pawnKillCount = 1;
                    }
                }
            }
        }

        gamePlayData.data[type] += bonusPoint;
        if (type == 'home_base_bonus')
        {
            gamePlayData.data.home_base += 1;
        }
    }

    addSix(room, id, myRoom)
    {
        for (let j = 0; j < myRoom.users.length; j++)
        {
            // console.log("id we got", this.tables[i].users[j])
            if (myRoom.users[j].id == id)
            {
                myRoom.users[j].six_counts += 1;
                // console.log('Six updated', myRoom.users[j].six_counts);
            }
        }
    }

    setSix(room, id, myRoom)
    {
        for (let j = 0; j < myRoom.users.length; j++)
        {
            if (myRoom.users[j].id == id)
            {
                myRoom.users[j].six_counts = 0;
                // console.log('Six updated', myRoom.users[j].six_counts);
            }
        }
    }

    isSkippable(myRoom, dice_value, position) 
    {
        if(myRoom) {
            const me = myRoom.users.find((elem) => elem.position == position);
            if(me) {
                let sixCount = this.getSix(myRoom.room, me.id, myRoom);
                // to check three six.
                if(sixCount == 2 && dice_value == 6){
                    return true;
                }
                // to check move not possible.           
                let userPawns = myRoom.users[me.position].tokens;
                // calculate target user pawn index.
                let pawnIndexes = userPawns.map(pawn => (pawn + dice_value));
                if(pawnIndexes[0] <= 56 || pawnIndexes[1] <= 56 || pawnIndexes[2] <= 56 || pawnIndexes[3] <= 56){
                    return false;
                } else {
                    return true;
                }
            } else {
                return false;
            }
        } else {
            return false;
        }
    }

    getRandomDiceValue(){
        return Math.floor(Math.random() * 5) + 1;
    }

    getSix(room, id, myRoom)
    {
        if (!myRoom) return 0;
        const me = myRoom.users.find((elem) => elem.id == id);
        if (!me) return 0;
        else return me.six_counts;
    }
    scrapTurn(room, pos, myRoom)
    {
        if(myRoom.users[pos])
            myRoom.users[pos].dices_rolled = [];     
    }

    getMyPosition(room, id, myRoom)
    {
        //const table = this.tables.find((elem) => elem.room == room);
        // const table = myRoom;
        if (!myRoom) return -1;

        const me = myRoom.users.find((elem) => elem.id == id);
        return me ? myRoom.users.indexOf(me) : -1;
    }

    getMyDice(room, id, myRoom, gamePlayData)
    {   
        // console.log('getMyDiceError', JSON.stringify(gamePlayData));
        if (!myRoom) return -1;
        const me = myRoom.users.find((elem) => elem.id.toString() == id.toString());
        if(!gamePlayData.data.roll)
         gamePlayData.data.roll=[];
        let a = me ? me.dices_rolled[me.dices_rolled.length - 1] : -1;
        gamePlayData.data.roll.push(a);
        return a;
    }

    jackPot(room, id, myRoom)
    {
        // const table = this.tables.find((elem) => elem.room == room);

        if (!myRoom) return false;

        const me = myRoom.users.find((elem) => elem.id == id);

        if (!me) return false;
        return (
            me.dices_rolled.length == 3 && me.dices_rolled[0] == 6 && me.dices_rolled[1] == 6 && me.dices_rolled[2] == 6
        );
    }

    updateCurrentTurn(room, pos, type, prev, move, myRoom)
    {
      //console.log('updateCurrentTurn input ' + room + "_"+ pos+ "_"+ type+ "_"+prev+ "_"+move+ "_"+JSON.stringify(myRoom))
        // for (let i = 0; i < this.tables.length; i++)
        // {
        //     if (this.tables[i].room == room)
        //     {
                //for debugging.....
                //console.log('updateCurrentTurn >>>:: ', myRoom.users[pos]);
               if(pos<0)
                  return;
                if (prev != -1 && move == 0)
                {
                    myRoom.users[prev].dices_rolled = [];
                    myRoom.users[prev].six_counts = 0;
                    myRoom.users[pos].turn += 1;
                }
                if (move)
                {
                    myRoom.current_turn_type = type;
                    myRoom.current_turn = pos;
                }
                else
                {
                    myRoom.current_turn = pos;
                    myRoom.turn_start_at = new Date().getTime();
                    myRoom.turn_timestamp = new Date();
                    //console.log("Line 701 turn set : ", new Date().getTime(), new Date());
                    myRoom.current_turn_type = type;
                }
                //console.log('updateCurrentTurn res ' + JSON.stringify(myRoom))
            // }
        // }

    }
    updateCurrentTime(room, myRoom)
    {
        myRoom.turn_start_at = new Date().getTime();
        myRoom.turn_timestamp = new Date();
    }


    gePlayerDices(room, pos, myRoom, gamePlayData)
    {
         if (myRoom && pos>-1)
        {
            //*****comment below line for Data Inconsistency Issue.
            // gamePlayData.data.User = myRoom.users[pos].numeric_id;
            return myRoom.users[pos].dices_rolled;
        }
        return [];
    }
    async sendToSqsAndResetGamePlayData(room, myRoom, gamePlayData, myPos)
    {
        await sendMessage(gamePlayData);
        //send through SQS
        await this.resetGamePlayData(room, myRoom, gamePlayData,myPos);
    }

    async resetGamePlayData(room, myRoom, gamePlayData, myPos)
    {
        let user = myRoom.users[myRoom.current_turn];
        gamePlayData.data.User = user.numeric_id,
        gamePlayData.data.lobbyId = user.lobbyId,
        gamePlayData.data.turn = user.turn,
        gamePlayData.data.roll = [],
        gamePlayData.data.pawn = 0,
        gamePlayData.data.move = 0,
        gamePlayData.data.total_move = 0,
        gamePlayData.data.cut = 0,
        // gamePlayData.data.cut_player = 0,
        // gamePlayData.data.cut_pawn = 0,
        // gamePlayData.data.cut_move = 0,
        gamePlayData.data.cut_bonus = 0,
        gamePlayData.data.home_base = 0,
        gamePlayData.data.home_base_bonus = 0,
        gamePlayData.data.extra_roll = 0,
        gamePlayData.data.extra_roll_count = 0,
        gamePlayData.data.extra_roll_reason = [],
        gamePlayData.data.kill_player_data = [],
        gamePlayData.data.pawnSafe_status = user.pawnSafe_status,
        gamePlayData.data.pawn_move_time = [],
        gamePlayData.data.dice_tap_time = [],
        gamePlayData.data.time_between_tap_and_move = [],
        gamePlayData.data.checkpoint = user.checkpoint,
        gamePlayData.data.player_score = user.points + user.bonusPoints,
        gamePlayData.data.points = 0,
        gamePlayData.data.points_per_diceRoll = [],
        gamePlayData.data.life_lost = 3 - user.life,
        gamePlayData.data.lives_left = user.life,
        gamePlayData.data.pawn_positions = user.tokens,
        gamePlayData.data.game_time = 0,
        gamePlayData.data.room_id = room,
        gamePlayData.data.timestamp = new Date().getTime()
        await redisCache.addToRedis('gamePlay_'+room, gamePlayData);
    }

    clearDices(room, pos, myRoom)
    {
        let table = myRoom;
        table.users[pos].dices_rolled = [];
        return table;
    }

    getNextPosition(room, pos, myRoom)
    {
        // New modification
        let table = myRoom;
        //console.log("getNextPosition Room : " + JSON.stringify(myRoom));
       // console.log("getNextPosition pos: " + pos);
        for (let j = pos + 1; j < table.users.length; j++)
        {
            if (table.users[j].is_active && !table.users[j].is_done)
            {
                // console.log("getNextPosition j: " + j);
                return j;
            }
        }
        for (let j = 0; j < pos; j++)
        {
            if (table.users[j].is_active && !table.users[j].is_done)
            {
                // console.log("getNextPosition j1: " + j);
                return j;
            }
        }
        return -1;
    }

    killCheckOnDiceValue(id, dice_value, myRoom)
    {
        let userIndex = myRoom.users.findIndex(user => user.id == id);
        let userPawns = users[userIndex].tokens;
        // calculate target user pawn index.
        let targetIndexes = userPawns.map(pawn => (pawn + dice_value));
        // Check if any other users pawn index matches the target index.
        let safeZone = [1, 14, 27, 40, 22, 35, 9, 48, 56];
        let canCutOthers = false;
        myRoom.users.forEach((user, index) => {
            if (index !== userIndex) {
                for (let i = 0; i < user.tokens.length; i++) {
                    if(!safeZone.includes(user.tokens[i])) {
                        if (user.tokens[i] == targetIndexes[0] || user.tokens[i] == targetIndexes[1] || user.tokens[i] == targetIndexes[2] || user.tokens[i] == targetIndexes[3]) {
                            canCutOthers = true;
                            break;
                        }
                    }
                }
            }
        });
        return canCutOthers;
    }

    CanIKill(room, id, token_index, myPos, myRoom, gamePlayData)
    {   
        let table = myRoom;
        var tab_pos = 0;
        // for (let i = 0; i < this.tables.length; i++)
        // {
        //     if (this.tables[i].room == room)
        //     {
        //         tab_pos = i;
        //     }
        // }

        const actual_token_position = config.MOVE_PATH[myPos][table.users[myPos].tokens[token_index]];
        if (actual_token_position == -1) 
        {
            let responseObj = {
                'dead_possible' :  false,
                'myRoom'    : table,
                'gameData'  : gamePlayData
            }
            return responseObj;
        }
        if (config.safeZone.includes(actual_token_position)) 
        {
            let responseObj = {
                'dead_possible' :  false,
                'myRoom'    : table,
                'gameData'  : gamePlayData
            }
            return responseObj;
        } //MAIN USER 2 TOKEN 38 POSITION 11

        var dead_possible = [];
        var i = tab_pos;
        for (let j = 0; j < table.users.length; j++)
        {
            if (table.users[j].id != id)
            {
                for (let k = 0; k < table.users[j].tokens.length; k++)
                {
                    if (table.users[j].tokens[k] != -1 && !table.users[j].is_left)
                    {
                        let other_token_position = config.MOVE_PATH[j][table.users[j].tokens[k]];
                        if (other_token_position == actual_token_position && table.users[j].tokens[k] != config.starPosition[0])
                        {
                            dead_possible.push({
                                user: j,
                                token: k,
                                user_id : table.users[j].numeric_id,
                            });
                        }
                    }
                }
            }
        }
        var us = [];
        let safe_user = []

        for (let i = 0; i < dead_possible.length; i++)
        {
            if (us.indexOf(dead_possible[i].user) > -1)
            {
                safe_user.push(dead_possible[i].user)
            } else
            {
                us.push(dead_possible[i].user);
            }
            // i++;
        }

        for (let i = 0; i < safe_user.length; i++)
        {
            for (let j = 0; j < dead_possible.length; j++)
            {
                //console.log("safe_user[i] >>>>", i, safe_user[i], "dead_possible[j].user >>>>", j, dead_possible[j].user)
                dead_possible = dead_possible.filter((e) => safe_user[i] != e.user);
            }
        }

        //console.log('After loop DEAD POSSIBLE Tourney', dead_possible);
       // let gamePlayData = await redisCache.getRecordsByKeyRedis('gamePlay_'+room);
        if (dead_possible.length)
        {
           gamePlayData.data.cut += dead_possible.length;
        }

        for (i = 0; i < dead_possible.length; i++)
        {
            let checkPointActivated = false;
            let token_position = table.users[dead_possible[i].user].tokens[dead_possible[i].token];
            //console.log("Token Poisition - ", token_position)
            if (token_position >= config.starPosition[0]) checkPointActivated = true;
            //console.log("My Points >>> ", table.users[myPos].points, table.users[dead_possible[i].user], checkPointActivated)
            // this.tables[tab_pos].users[dead_possible[i].user].points = this.tables[tab_pos].users[dead_possible[i].user].points - this.tables[tab_pos].users[dead_possible[i].user].tokens[dead_possible[i].token];
            dead_possible[i].checkPointActivated = checkPointActivated;
            //gamePlayData.data["cut_player " + i] = dead_possible[i].user;
            //gamePlayData.data["cut_pawn " + i] = dead_possible[i].token;

           // gamePlayData.data["cut_player"] = dead_possible[i].user;
            //gamePlayData.data["cut_pawn"] = dead_possible[i].token;

            // console.log("this.gamePlayData[gamePlayDataIndex].data >",this.gamePlayData[gamePlayDataIndex].data)
            if (checkPointActivated)
            {

                let cutPoint = table.users[dead_possible[i].user].tokens[dead_possible[i].token];
                table.users[dead_possible[i].user].tokens[dead_possible[i].token] = config.starPosition[0];
                dead_possible[i].tokenIndex = config.starPosition[0];
                dead_possible[i].movebleBox = cutPoint - config.starPosition[0];
                //console.log("KILL TOKEN INDEX UPDATE _ ", table.users[dead_possible[i].user].points, cutPoint, typeof cutPoint)
                table.users[dead_possible[i].user].points = table.users[dead_possible[i].user].points - cutPoint + config.starPosition[0];
                //console.log("AFTER KILL TOKEN INDEX UPDATE _", table.users[dead_possible[i].user].tokens[dead_possible[i].token], table.users[dead_possible[i].user].points)
                //gamePlayData.data["cut_move " + i] = cutPoint + " - " + config.starPosition[0];
               // gamePlayData.data["cut_move"] = cutPoint;
            }
            else
            {
                dead_possible[i].movebleBox = table.users[dead_possible[i].user].tokens[dead_possible[i].token];
                table.users[dead_possible[i].user].points -= table.users[dead_possible[i].user].tokens[dead_possible[i].token]; //commented above line and replace with this line
                table.users[dead_possible[i].user].tokens[dead_possible[i].token] = 0;
                dead_possible[i].tokenIndex = 0;
                // gamePlayData.data["cut_move " + i] = dead_possible[i].movebleBox + " - 0"
               // gamePlayData.data["cut_move"] = dead_possible[i].movebleBox;
                // added this line to store cut_player data.
                //gamePlayData.data["cut_player " + i] = dead_possible[i].user;
            }
            // Send the Kill player object to gamePlayData
            // gamePlayData.data["kill_player_data"] = dead_possible;
            let killPlayerData = {
                'cut_player' : dead_possible[i].user_id,
                'cut_pawn' : dead_possible[i].token +1,
                'cut_move' : dead_possible[i].movebleBox,
            }
            gamePlayData.data.kill_player_data.push(killPlayerData);
        }
        //console.log("dead_possible >new>>>", dead_possible);
        //console.log('KILL TABLE INFO ::', table);
        //return dead_possible.length > 0 ? dead_possible : false;
        let responseObj = {
            'dead_possible' : dead_possible.length > 0 ? dead_possible : false,
            'myRoom'    : table,
            'gameData'  : gamePlayData
        }
        return responseObj;
    }

    isMovePossible(room, id, myRoom)
    {
        const table = myRoom;
        const me = table.users.find((elem) => elem.id == id);
        if (!me) return false;
        for (let k = 0; k < me.tokens.length; k++)
        {
            for (const dice_value of me.dices_rolled)
            {
                if (me.tokens[k] + dice_value <= 56)
                {
                    return true;
                }
            }
        }
        return false;
    }

    
    isMovePossibleExact(dice_value, room, id, token_index, myRoom)
    {
        const table = myRoom;        
        if (!table) return false;
        const me = table.users.find((elem) => elem.id == id);        
        if (!me) return false;
        if (me.dices_rolled.indexOf(dice_value) == -1) return false;
        for (let k = 0; k < me.tokens.length; k++)
        {
            if (me.tokens[token_index] == -1)
            {
                return dice_value == 1 || dice_value == 6;
            } else
            {
                return !(me.tokens[token_index] + dice_value > 56);
            }
        }
    }
    // This function used to prefix an integer with 0.
    pad(num, size) {
        num = num.toString();
        while (num.length < size) num = "0" + num;
        return num;
    }

    async setGameTime(myRoom)
    {
        let gameStartTime = myRoom.game_started_at; 
        if(gameStartTime) {
            // To convert New Date() getTime to Second.
            let time = (Math.round(new Date().getTime() / 1000) - Math.round(gameStartTime / 1000));
            let minutes = 0;
            let seconds = 0;
            let remainingTime = 0;
            if(time > 0) {
                remainingTime = config.gameTime * 60 - time;
                minutes = Math.floor(Math.abs(remainingTime) / 60);
                seconds = Math.abs(remainingTime) - Math.abs(minutes) * 60;
            } 
            if (remainingTime < 0) {
                return "-"+Math.abs(minutes) +":"+this.pad(seconds,2);  
            }
            return minutes + ":" + this.pad(seconds,2);
        } else {
            return "10:00";
        }
    }

    async setPawnMoveTime(myRoom)
    {
        let turnStarted = new Date(myRoom.turn_timestamp).getTime();
        let currentTime = new Date().getTime();
        let timeDiff = currentTime - turnStarted;
        let pawnTapTime = (timeDiff/1000).toFixed(2);
        if(pawnTapTime > 10){
            //return "10";
            return "0";
        } else {
           //return pawnTapTime;
            return (10 - pawnTapTime).toFixed(2);
        }
    }

    async makeMoveForTournament(dice_value, room, id, token_index, myRoom, gamePlayData)
    {
       const table = myRoom;
                for (let j = 0; j < table.users.length; j++)
                {
                    if (table.users[j].id == id)
                    {
                        // console.log('PENDING DICES BEFORE', table.users[j].dices_rolled, table.users[j].points, dice_value);
                        let user_points = 0;
                        gamePlayData.data.points_per_diceRoll.map(function(ele) {
                            user_points += ele;
                        });
                        if (table.users[j].tokens[token_index] + dice_value <= 56)
                        {
                            table.users[j].tokens[token_index] += dice_value;
                            //Update points for tournament
                            table.users[j].points = table.users[j].points + dice_value;

                            table.users[j].dices_rolled.splice(
                                table.users[j].dices_rolled.indexOf(dice_value),
                                1
                            );
                            // console.log('PENDING DICES AFTER', table.users[j].dices_rolled, table.users[j].points);

                            // var gamePlayDataIndex = this.gamePlayData.findIndex((x) => x.room == room);
                            gamePlayData.data.pawn = token_index + 1;
                            gamePlayData.data.move = gamePlayData.data.roll.length;
                            //gamePlayData.data.points += (dice_value + gamePlayData.data.cut_bonus + gamePlayData.data.home_base_bonus);
                            gamePlayData.data.total_move += dice_value;
                            gamePlayData.data.points = user_points + (+gamePlayData.data.total_move);
                            gamePlayData.data.player_score = table.users[j].points + table.users[j].bonusPoints;
                            gamePlayData.data.pawn_positions = table.users[j].tokens;
                            gamePlayData.data.game_time = await this.setGameTime(myRoom);
                            
                            // to set checkpoint status for all pawns
                            let myPawnPosition = table.users[j].tokens;
                            const pawnSafeArray = [false, false, false, false];
                            const pawnCheckpointArray = [false,false,false,false];
                            for (let index = 0; index < myPawnPosition.length; index++) {

                                if (myPawnPosition[index] >= config.starPosition[0]){
                                    pawnCheckpointArray[index] = true;
                                }

                                const element = myPawnPosition[index] + 1;
                                if(config.safeZone.includes(element) || element == 57){
                                    pawnSafeArray[index] = true;
                                } else {
                                    for (let jIndex = index + 1; jIndex < myPawnPosition.length; jIndex++) {
                                        const nextElement = myPawnPosition[jIndex] + 1;
                                        if (element == nextElement) {
                                            pawnSafeArray[index] = true;
                                            pawnSafeArray[jIndex] = true;
                                        }
                                    }
                                }
                            }
                            // To save pawn safe status
                            gamePlayData.data.pawnSafe_status = pawnSafeArray;
                            table.users[j].pawnSafe_status = pawnSafeArray;
                            // To save pawn checkpoint status                           
                            gamePlayData.data.checkpoint = pawnCheckpointArray;
                            table.users[j].checkpoint = pawnCheckpointArray;
                            
                            // console.log("GAME PLAY DATA > ", this.gamePlayData[gamePlayDataIndex])
                            return {
                                'token_position': table.users[j].tokens[token_index], 
                                'points': table.users[j].points, 
                                'bonusPoints': table.users[j].bonusPoints,
                                'table' : table,
                                'gamePlayData' : gamePlayData
                            };
                        } else
                        {
                            table.users[j].dices_rolled.splice(
                                table.users[j].dices_rolled.indexOf(dice_value),
                                1
                            );
                            // Added gameplay Data//
                            gamePlayData.data.pawn = token_index + 1;
                            gamePlayData.data.move = gamePlayData.data.roll.length;
                            //gamePlayData.data.points += (dice_value + gamePlayData.data.cut_bonus + gamePlayData.data.home_base_bonus);
                            gamePlayData.data.total_move += dice_value;
                            gamePlayData.data.points = user_points + (+gamePlayData.data.total_move);                           
                            gamePlayData.data.player_score = table.users[j].points + table.users[j].bonusPoints;
                            gamePlayData.data.pawn_positions = table.users[j].tokens;
                            gamePlayData.data.game_time = await this.setGameTime(myRoom);
                            // to set checkpoint status for all pawns
                            let myPawnPosition = table.users[j].tokens;
                            const pawnSafeArray = [false, false, false, false];
                            const pawnCheckpointArray = [false,false,false,false];
                            for (let index = 0; index < myPawnPosition.length; index++) {

                                if (myPawnPosition[index] >= config.starPosition[0]){
                                    pawnCheckpointArray[index] = true;
                                }
                                
                                const element = myPawnPosition[index] + 1;
                                if(config.safeZone.includes(element) || element == 57){
                                    pawnSafeArray[index] = true;
                                } else {
                                    for (let jIndex = index + 1; jIndex < myPawnPosition.length; jIndex++) {
                                        const nextElement = myPawnPosition[jIndex]+1;
                                        if (element == nextElement) {
                                            pawnSafeArray[index] = true;
                                            pawnSafeArray[jIndex] = true;
                                        }
                                    }
                                }
                            }
                            // To save pawn safe zone status
                            gamePlayData.data.pawnSafe_status = pawnSafeArray;
                            table.users[j].pawnSafe_status = pawnSafeArray;                            
                            // To save pawn checkpoint status                           
                            gamePlayData.data.checkpoint = pawnCheckpointArray;
                            table.users[j].checkpoint = pawnCheckpointArray;

                            // console.log('PENDING DICES AFTER', table.users[j].dices_rolled, table.users[j].points);
                            return {
                                'token_position': table.users[j].tokens[token_index], 
                                'points': table.users[j].points, 
                                'bonusPoints': table.users[j].bonusPoints,
                                'table' : table,
                                'gamePlayData' : gamePlayData

                            };
                        }
                    }
                }
            // }
        // }
        return -1;
    }
  
    EndOfTournamentV2(room, amount, myRoom)
    {
        const table = myRoom;
        const activeUserPointArray = [];
        const nonActiveUserPointArray = [];
        const leftUsersLeavingGameTimeArray = [];
        const winner = [];
        let activeRankedUserMap = new Map();
        let activeUserMap = new Map();
        let inactiveUserMap = new Map();
        let leftUserMap = new Map();
        let UserRankArray = new Map();
        let UserRankWiseAmount = new Map();
        let firstRank = 0;
            
        for (let j = 0; j < table.users.length; j++)
        {
            let totalScore = table.users[j].points + table.users[j].bonusPoints;
            // if (table.users[j].is_active && !table.users[j].hasOwnProperty("is_left") 
            //     && table.users[j].rank == 1) {
            //     firstRank = 1;
            //     UserRankArray.set(j, firstRank);
            // } else 
            if (table.users[j].is_active && !table.users[j].hasOwnProperty("is_left")) {
                activeUserMap.set(j, totalScore);
                activeUserPointArray.push(totalScore);
            } else if (table.users[j].hasOwnProperty("is_left")) {
                leftUserMap.set(j, table.users[j].left_time);
                leftUsersLeavingGameTimeArray.push(table.users[j].left_time);
            } else {
                inactiveUserMap.set(j, totalScore);
                nonActiveUserPointArray.push(totalScore);
            }
        }
        // console.log({activeUserPointArray} , {activeUserMap}, {inactiveUserMap});
        //var maxPoints = (Math.max(...pointArray));
        activeUserPointArray.sort((a, b) => b - a);
        nonActiveUserPointArray.sort((a, b) => b - a);
        leftUsersLeavingGameTimeArray.sort((a, b) => a - b);

        activeUserMap = new Map([...activeUserMap.entries()].sort((a, b) => b[1] - a[1]));
        inactiveUserMap = new Map([...inactiveUserMap.entries()].sort((a, b) => b[1] - a[1]));
        leftUserMap = new Map([...leftUserMap.entries()].sort((a, b) => a[1] - b[1]));
        // let point = activeUserPointArray.concat(nonActiveUserPointArray);;
        // point.sort((a, b) => b - a);
        let otherRank = 0;

        for (let [key, value] of activeUserMap) {
            let playerIndex = activeUserPointArray.indexOf(value);
            let userRank = playerIndex + 1;
            UserRankArray.set(key, userRank);
        }

        for (let [key, value] of leftUserMap) {
            let playerIndex = leftUsersLeavingGameTimeArray.indexOf(value);
            let userRank = activeUserPointArray.length + playerIndex + 1;
            UserRankArray.set(key, userRank);
        }

        for (let [key, value] of inactiveUserMap) {
            let playerIndex = nonActiveUserPointArray.indexOf(value);
            let userRank = activeUserPointArray.length + leftUsersLeavingGameTimeArray.length + playerIndex + 1;
            UserRankArray.set(key, userRank);
        }

        let oneRankCounter = 0;
        let twoRankCounter = 0;
        let threeRankCounter = 0;
        let fourRankCounter = 0;

        for (let [key, value] of UserRankArray)
        {
            if (value == 1) {
                var currentAmount = 0;
                if (UserRankWiseAmount.get(value)) {
                    currentAmount += UserRankWiseAmount.get(value);
                }
                if (amount[value + oneRankCounter]) {
                    currentAmount += amount[value + oneRankCounter];
                    UserRankWiseAmount.set(value, currentAmount);
                }
                oneRankCounter++;
            } else if (value == 2) {
                var currentAmount = 0;
                if (UserRankWiseAmount.get(value)) {
                    currentAmount += UserRankWiseAmount.get(value);
                }
                if (amount[value + twoRankCounter]) {
                    currentAmount += amount[value + twoRankCounter];
                    UserRankWiseAmount.set(value, currentAmount);
                }
                twoRankCounter++;
            }  else if (value == 3) {
                var currentAmount = 0;
                if (UserRankWiseAmount.get(value)) {
                    currentAmount += UserRankWiseAmount.get(value);
                }
                if (amount[value + threeRankCounter]) {
                    currentAmount += amount[value + threeRankCounter];
                    UserRankWiseAmount.set(value, currentAmount);
                }
                threeRankCounter++;
            }  else if (value == 4) {
                var currentAmount = 0;
                if (UserRankWiseAmount.get(value)) {
                    currentAmount += UserRankWiseAmount.get(value);
                }
                if (amount[value + fourRankCounter]) {
                    currentAmount += amount[value + fourRankCounter];
                    UserRankWiseAmount.set(value, currentAmount);
                }
                fourRankCounter++;
            } 
        }

        // console.log('UserRankWiseAmount', UserRankWiseAmount, UserRankArray);

        for (let k = 0; k < table.users.length; k++)
        {   
            table.users[k].rank = UserRankArray.get(k);
            otherRank = table.users[k].rank;
            // console.log('Rank ------------------->', otherRank, UserRankWiseAmount.get(1));
            let winAmount = 0;
            if (typeof amount != 'undefined' && otherRank == 1 
                && UserRankWiseAmount.get(1) && !table.users[k].hasOwnProperty("is_left"))
            {
                // console.log('Rank 1 ------------------->', UserRankWiseAmount.get(1));
                winAmount = otherRank == 1 ? Math.floor(UserRankWiseAmount.get(1)/(oneRankCounter == 0 ? 1 : oneRankCounter)) : 0;
                                            
            } else if (typeof amount != 'undefined' && otherRank == 2 
                && UserRankWiseAmount.get(2) && !table.users[k].hasOwnProperty("is_left"))
            {
                // console.log('Rank 2 ------------------->', UserRankWiseAmount.get(2));
                winAmount = otherRank == 2 ? Math.floor(UserRankWiseAmount.get(2)/(twoRankCounter == 0 ? 1 : twoRankCounter)) : 0;            
                
            } else if (typeof amount != 'undefined' && otherRank == 3 
                && UserRankWiseAmount.get(3) && !table.users[k].hasOwnProperty("is_left"))
            {
                // console.log('Rank 3 ------------------->', UserRankWiseAmount.get(3));
                winAmount = otherRank == 3 ? Math.floor(UserRankWiseAmount.get(3)/(threeRankCounter == 0 ? 1 : threeRankCounter)) : 0;
            } else if (typeof amount != 'undefined' && otherRank == 4
                && UserRankWiseAmount.get(4) && !table.users[k].hasOwnProperty("is_left"))
            {
                // console.log('Rank 4 ------------------->', UserRankWiseAmount.get(4));
                winAmount = otherRank == 4 ? Math.floor(UserRankWiseAmount.get(4)/(fourRankCounter == 0 ? 1 : fourRankCounter)) : 0;
            }
            // console.log('Rank Wise Amount ------------------->', winAmount);

            table.players_won += 1;
            table.players_done += 1;
            table.users[k].is_done = true;
            winner.push({
                    player_index: table.users[k].position,
                    name: table.users[k].name,
                    numeric_id: table.users[k].numeric_id,
                    token : table.users[k].user_token,
                    rank: table.users[k].rank,
                    id: table.users[k].id,
                    amount: winAmount,
                    is_left: table.users[k].hasOwnProperty("is_left"),
                    score: table.users[k].points + table.users[k].bonusPoints
                });
        }
        return {
            'winner': winner,
            'table' : table
        };
    }
    allHome(room, id, myRoom)
    {
        let sum = 0;
        const table = myRoom;
        for (let j = 0; j < table.users.length; j++)
        {
            if (table.users[j].id == id)
            {
                for (var z = 0; z < 4; z++)
                {
                    sum = sum + table.users[j].tokens[z];
                }

                if (sum == 224) // all the pawns reached home for id
                {
                    table.players_won += 1;
                    table.players_done += 1;
                    table.users[j].is_done = true;
                    table.users[j].rank = table.players_won;
                    return {
                        'rank': table.players_won,
                        'position': table.users[j].position,
                        'table' : table
                    };
                }
                return false;
            }
        }
        return false;
    }
    calculateUserRank(userData, myRoom)
    {
        let table = myRoom;
        let pointArray = []
        for (let j = 0; j < table.users.length; j++)
        {
            pointArray.push(table.users[j].points + table.users[j].bonusPoints);
        }
        // console.log("calculateUserRank pointArray >>>", pointArray)
        var maxPoints = (Math.max(...pointArray));
        // console.log("calculateUserRank maxPoints >>>", maxPoints)
        let point = pointArray;
        point.sort((a, b) => b - a);

        for (let k = 0; k < table.users.length; k++)
        {
            for (let j = 0; j < point.length; j++)
            {
                // console.log("calculateUserRank HERE - ", point[j], table.users[k].points + table.users[k].bonusPoints)
                if (point[j] == table.users[k].points + table.users[k].bonusPoints && userData.id == table.users[k].id) 
                {
                    table.users[k].rank = j + 1;
                    break;
                };
            }            
        }
        return table;
    }

    //TODO: Revamp winnings logic
    isThisTheEnd(room, win_amount, myRoom)
    {
        // console.log("isThisTheEnd>> ", room, win_amount,myRoom)
        let table = myRoom;

        let rank = [];
        for (let j = 0; j < table.users.length; j++)
        {
            let amount = 0;
            
            if (table.users[j].rank === 0 && table.users[j].numeric_id != '')
            {
                table = this.calculateUserRank(table.users[j], table);
            }

            if (typeof win_amount != 'undefined' && table.users[j].rank == 1 && win_amount[1])
            {
                amount = table.users[j].rank == 1 ? win_amount[1] : 0;
            } else if (typeof win_amount != 'undefined' && table.users[j].rank == 2 && win_amount[2])
            {
                amount = table.users[j].rank == 2 ? win_amount[2] : 0;
            } else if (typeof win_amount != 'undefined' && table.users[j].rank == 3 && win_amount[3])
            {
                amount = table.users[j].rank == 3 ? win_amount[3] : 0;
            }
            // console.log("for score >>>>", table.users[j])
            rank.push({
                player_index: table.users[j].position,
                name: table.users[j].name,
                numeric_id: table.users[j].numeric_id,
                token : table.users[j].user_token,
                rank: table.users[j].rank,
                amount: amount,
                id: table.users[j].id,
                is_left: table.users[j].hasOwnProperty('is_left'),
                score: table.users[j].points + table.users[j].bonusPoints
            });
        }
        // console.log("isThisTheEnd>> rank", room, JSON.stringify(rank));
        if (table.no_of_players == 2 || table.no_of_players == 3)
        {
            if (table.players_won == 1 || table.players_done>=1)
            {
                return {
                    'rank' : rank,
                    'table' : table
                };
            } else return false;
        }
        else if (table.no_of_players == 4)
        {
            if (table.players_won == 2)
            {
                return {
                    'rank' : rank,
                    'table' : table
                };
            } 
            else if (table.players_done >= 3)
            {
                if(!table.players_won)
                    table.players_won=0;

                for (let j = 0; j < table.users.length; j++)
                {
                    if (table.users[j].is_active && !table.users[j].is_done)
                    {
                        table.players_won += 1;
                        table.players_done += 1;
                        table.users[j].is_done = true;
                        // table.users[j].rank = table.players_won;
                        if(!table.users[j].rank)
                        {
                            let user_rank = myRoom.no_of_players;

                            while (this.isRankOccupied(room, user_rank, myRoom))
                            {
                                user_rank--;
                                if (user_rank == 1) break;
                            }
                            table.users[j].rank = user_rank;
                        }
                    }
                }

                rank = [];
                for (let j = 0; j < table.users.length; j++)
                {
                    let amount = 0;
                    if (typeof win_amount != 'undefined' && table.users[j].rank == 1 && win_amount[1])
                    {
                        amount = table.users[j].rank == 1 ? win_amount[1] : 0;
                    } else if (typeof win_amount != 'undefined' && table.users[j].rank == 2 && win_amount[2])
                    {
                        amount = table.users[j].rank == 2 ? win_amount[2] : 0;
                    } else if (typeof win_amount != 'undefined' && table.users[j].rank == 3 && win_amount[3])
                    {
                        amount = table.users[j].rank == 3 ? win_amount[3] : 0;
                    }
                    rank.push({
                        player_index: table.users[j].position,
                        name: table.users[j].name,
                        token : table.users[j].user_token,
                        numeric_id: table.users[j].numeric_id,
                        rank: table.users[j].rank,
                        amount: amount,
                        id: table.users[j].id,
                        is_left: table.users[j].hasOwnProperty('is_left'),
                        score: table.users[j].points + table.users[j].bonusPoints
                    });
                }
                return {
                    'rank' : rank,
                    'table' : table
                };
            } else return false;
        }
        return false;
    }

    calculateGameEndData(room, win_amount, myRoom)
    {
        // console.log("isThisTheEnd>> ", room, win_amount,myRoom)
        let endData = this.EndOfTournamentV2(room, win_amount, myRoom);
        return {
            'rank' : endData.winner,
            'table' : endData.table
        };
    }

    checkOnlyPlayerLeft(room, myRoom)
    {
        // console.log('CHECKING PLAYERS LEFT');
        let table = myRoom;
        // console.log("checkOnlyPlayerLeft : Step 1: ")
        if (table.no_of_players - table.players_done == 1)
        {
            // console.log("checkOnlyPlayerLeft : Step 2: ")
            for (let j = 0; j < table.users.length; j++)
            {
                // console.log('USER', this.tables[i].users[j]);
                // console.log("checkOnlyPlayerLeft : Step 3: ", table.users[j].is_active, !table.users[j].is_done, !table.users[j].is_left)
                if (
                    table.users[j].is_active &&
                    !table.users[j].is_done &&
                    !table.users[j].is_left
                )
                {
                    table.players_won += 1;
                    table.players_done += 1;
                    table.users[j].is_done = true;
                    //TO DO: 
                    
                    let rank = table.users[j].rank;
                    // console.log('Rank received: ', rank);
                    if(!rank || rank<1)
                    {
                        rank=table.no_of_players;
                        // console.log('Inside rank calc');
                        
                        while (this.isRankOccupied(room, rank, myRoom))
                        {
                            
                            // console.log('Inside rank deduc');
                            rank--;
                            if (rank == 1) break;
                        }
                    }
                    table.users[j].rank=rank;
                    // console.log('Rank alotted: ' +rank+  JSON.stringify(table.users[j]));
                    //table.users[j].rank = table.players_won;
                    return {
                        'response': true,
                        'table' : table,
                    };
                }
                // console.log('table found', this.tables);
            }
            return {
                'response': true,
                'table' : table,
            };
        }
        return {
            'response': false,
            'table' : table,
        };
    }

    isCurrentTurnMine(room, position, myRoom)
    {
        const table = myRoom;
        if (!table) return false;
        return table.current_turn == position;
    }

    getMyLife(room, id, myRoom)
    {
        const table = myRoom;
        if (!table) return 0;
        const me = table.users.find((elem) => elem.id == id);
        if (!me) return 0;
        return me.life;
    }

    deductLife(room, id, myRoom, gamePlayData)
    {
        let table = myRoom;
        let idx = table.users.findIndex(element => element.id == id);
        table.users[idx].life--;
        gamePlayData.data.life_lost += 1;
        gamePlayData.data.lives_left -= 1;
        return {
            'table' : table,
            'gameData' : gamePlayData
        }
    }

    getMyIdByPosition(room, position, myRoom)
    {
        const table = myRoom;
        if (!table) return 0;
        return table.users[position] ? table.users[position].id : -1;
    }

    getTokens(room, myRoom)
    {
        let table = myRoom;
        if (!table)
        {
            return [];
        }
        let tokens = table.users.map((user) =>
        {
            return {
                user_id: user.id,
                tokens: user.tokens,
                points: user.points
            };
        });
        return tokens;
    }
    getPoints(room, myRoom)
    {
        let table = myRoom;
        if (!table)
        {
            return [];
        }
        let points = table.users.map((user) =>
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
        return points;
    }

    /**
     * The function used to return dice roll value.
     * @param {room} and {user_id} number.
     * @returns number.
     */
    rollDice(room, user_id, myRoom)
    {
        try { 
            let returnDiceValue = null;
            let randomNumber    = null;

            let table = myRoom;
            // let idx = table.users.findIndex(element => element.id == user_id);
            let idx = table.users.findIndex(element => element.position == user_id);
            //console.log('USER IDx', idx);
            // To check if predefined dice value is empty then create set of dice value first.           
            if(table.users[idx].diceValue.length == 0) {
                // to increase no of set dice value generated.
                myRoom.no_of_diceSet += 1;
                let dice_range;
                let min_no_of_occurance;
                if(myRoom.no_of_diceSet == 1) {
                    (myRoom.no_of_players == 2) ? (dice_range = Math.floor(Math.random() * (25 - 22)) + 22) : (dice_range = Math.floor(Math.random() * (12 - 8)) + 8);
                    (myRoom.no_of_players == 2) ? min_no_of_occurance = 2 : min_no_of_occurance = 1;
                } else if(myRoom.no_of_diceSet == 2){
                    (myRoom.no_of_players == 2) ? (dice_range = Math.floor(Math.random() * (12 - 8)) + 8) : (dice_range = Math.floor(Math.random() * (12 - 8)) + 8);
                    (myRoom.no_of_players == 2) ? min_no_of_occurance = 1 : min_no_of_occurance = 1;
                } else {
                    // do nothing for now.
                    (myRoom.no_of_players == 2) ? (dice_range = Math.floor(Math.random() * (12 - 8)) + 8) : (dice_range = Math.floor(Math.random() * (12 - 8)) + 8);
                    (myRoom.no_of_players == 2) ? min_no_of_occurance = 1 : min_no_of_occurance = 1;
                }

                // 80 percentage of number will generate 1 to 5 and 20 percentage generate 6.
                const original_dice_value = this.getCustomizedValue(dice_range, min_no_of_occurance);
                const previousSequences = new Set();
                //let player_0 = this.generateUniqueShuffledSequence(original_dice_value, previousSequences);
                let new_player_0 = this.rearrangeArrayWithoutConsecutiveRepeats(original_dice_value);
                // storing number for player One
                //table.users[0].diceValue = JSON.parse(JSON.stringify(player_0));
                console.log(typeof table.users[0].diceValue);
                table.users[0].diceValue.push(...new_player_0);
                // storing number for player Two
                //let player_1 = this.generateUniqueShuffledSequence(original_dice_value, previousSequences);
                //table.users[1].diceValue = JSON.parse(JSON.stringify(player_1));
                let new_player_1 = this.rearrangeArrayWithoutConsecutiveRepeats(original_dice_value);
                 table.users[1].diceValue.push(...new_player_1);                
                // storing number for player Three
                //let player_2 = this.generateUniqueShuffledSequence(original_dice_value, previousSequences);
                //table.users[2].diceValue = JSON.parse(JSON.stringify(player_2));
                let new_player_2 = this.rearrangeArrayWithoutConsecutiveRepeats(original_dice_value);
                 table.users[2].diceValue.push(...new_player_2);                
                // storing number for player four
                //let player_3 = this.generateUniqueShuffledSequence(original_dice_value, previousSequences);
                //table.users[3].diceValue = JSON.parse(JSON.stringify(player_3));
                let new_player_3 = this.rearrangeArrayWithoutConsecutiveRepeats(original_dice_value);
                 table.users[3].diceValue.push(...new_player_3);
                
                
                
                // To generate dice value between 10 to 20 range.
                // randomNumber = this.randomNumberGenerator(random);
                // table.users[0].diceValue = JSON.parse(JSON.stringify(randomNumber));
                // let player_1 = this.fisherShuffleGenerator(randomNumber);
                // table.users[1].diceValue = JSON.parse(JSON.stringify(player_1));
                // let player_2 = this.fisherShuffleGenerator(randomNumber);
                // table.users[2].diceValue = JSON.parse(JSON.stringify(player_2));
                // let player_3 = this.fisherShuffleGenerator(randomNumber);
                // table.users[3].diceValue = JSON.parse(JSON.stringify(player_3));
            }
             // pop from top of array and update the property value.
            returnDiceValue = table.users[idx].diceValue.shift();
            //console.log(`dice for user ${table.users[idx].id} is ${returnDiceValue} id- ${idx}`);
            return {
                'returnDiceValue' : returnDiceValue,
                'table' : table,
            }

        } catch(err) {
            let logData = {
                level: 'error',
                meta: { 'env' : `${process.env.NODE_ENV}`,'error': err, stackTrace : err.stack}
            };
            logDNA.error('rollDice', logData);
        }
    }

    /**
     * The function used to generate custom random number as per given data.
     * @param {number} dice_range means how many numbers want to generate.
     * @returns {combinedArray} array
     */
    old_getCustomizedValue(dice_range, min_no_of_occurance) {
        const numbers = [1, 2, 3, 4, 5, 6];
        const sequence = [];
        
        // Generate the initial random sequence
        for (let i = 0; i < dice_range; i++) {
          const randomIndex = Math.floor(Math.random() * numbers.length);
          sequence.push(numbers[randomIndex]);
        }
      
        // Ensure each number appears at least twice
        for (let num of numbers) {
          let count = sequence.filter(n => n === num).length;
          while (count < min_no_of_occurance) {
            const indexToReplace = sequence.indexOf(num);
            if (indexToReplace === -1) {
              break; // Exit the loop if no more occurrences can be replaced
            }
            sequence[indexToReplace] = numbers[Math.floor(Math.random() * numbers.length)];
            count++;
          }
        }

        return sequence;
    }

    getCustomizedValue(dice_range, no_of_occurance) {
        // Create an array to store the result
        const result = [];
        // Generate numbers 1 to 6 at least twice
        for (let i = 1; i <= 6; i++) {
          if(no_of_occurance == 1) {
            result.push(i);
          } else {
            result.push(i);
            result.push(i);
          }
        }
        // Generate additional random numbers to reach a total of dice_range
        while (result.length < dice_range) {
          const randomNumber = Math.floor(Math.random() * 6) + 1; // Generates a random number between 1 and 6 (inclusive)
          result.push(randomNumber);
        }
        // Shuffle the array to randomize the order
        //this.shuffleArray(result);
        return result;

    }

    /**
     * The functioned used to shuffle Array
     * @param {*} array 
     */
    shuffleArray(array) {
        for (let i = array.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [array[i], array[j]] = [array[j], array[i]];
        }
    }
    /**
     * The function used to generate unique shuffled series.
     * @param {array} 
     * @param {previousSequences} 
     * @returns {shuffled} 
     */
    generateUniqueShuffledSequence(array, previousSequences) {
    const shuffled = [...array];
    let isUnique = false;    
    while (!isUnique) {
        this.shuffleArray(shuffled);
        const serializedSequence = JSON.stringify(shuffled);    
        if (!previousSequences.has(serializedSequence)) {
            previousSequences.add(serializedSequence);
            isUnique = true;
        }
    }
    return shuffled;
    }

    
    working_generateUniqueShuffledSequence(array, previousSequences, maxAttempts = 5) {
        let attempts = 0;
        while (attempts <= maxAttempts) {
            const shuffled = [...array];
            this.shuffleArray(shuffled);
            const serializedSequence = JSON.stringify(shuffled);    
            if (!previousSequences.has(serializedSequence)) {
                previousSequences.add(serializedSequence);
                return shuffled;
            }
            attempts++;
        }
        previousSequences.add(serializedSequence);
        return shuffled; 
    }

    
    /**
     * The function used to generate random number between 1 to 6.
     * @param {number} number means how many numbers want to generate.
     * @returns {random} array
     */
    randomNumberGenerator(number) {
        let array = [];
        while(number > 0){
            array.push(Math.floor(Math.random() * 6) + 1);
            number --;
        }
        return array;
    }

    /**
     * The function based on Fisher-Yates algorithm.
     * 
     * @param {arr} array means it'll take input as array form.
     * @returns {arr} array
     */
    fisherShuffleGenerator(arr) {
        let i = arr.length;
        while (--i > 0) {
          let randIndex = Math.floor(Math.random() * (i + 1));
          [arr[randIndex], arr[i]] = [arr[i], arr[randIndex]];
        }
        return arr;
    }

    /**
     *  This function rearrangeArrayWithoutConsecutiveRepeats iterates through the diceValue array, 
     *  checking for consecutive repeats and shuffling elements as needed to satisfy the condition.
     */
    old_rearrangeArrayWithoutConsecutiveRepeats(arr) {
        const result = [];
        let count = 0;
        for (let i = 0; i < arr.length; i++) {
          if (count < 2 || arr[i] !== arr[i - 1] || arr[i] !== arr[i - 2]) {
            // If it's one of the first two elements or not repeating more than twice
            result.push(arr[i]);
            count = 1;
          } else {
            // Repeating more than twice consecutively, find a new position
            let newPosition;
            let attempts = 0;
            
            do {
              newPosition = Math.floor(Math.random() * (arr.length - i)) + i; // New position within the remaining elements
              attempts++;
              
              // To prevent infinite loop, check if the same element is not selected multiple times
              if (attempts >= 10) {
                break; // Exit the loop if too many attempts
              }
            } while (arr[newPosition] === arr[i]);
      
            // Swap elements to rearrange
            const temp = arr[i];
            arr[i] = arr[newPosition];
            arr[newPosition] = temp;
      
            result.push(arr[i]);
            count++;
          }
        }
      
        return result;
    }

    rearrangeArrayWithoutConsecutiveRepeats(arr) {
        const originalCopy = arr.slice(); // Create a copy of the original array
        const result = [];
      
        while (arr.length > 0) {
          let nextIndex = -1;
      
          for (let i = 0; i < arr.length; i++) {
            if (arr[i] !== result[result.length - 1]) {
              nextIndex = i;
              break;
            }
          }
      
          if (nextIndex === -1) {
            // If no valid next element is found, reset the result and try again
            result.length = 0;
            arr = originalCopy.slice();
          } else {
            result.push(arr[nextIndex]);
            arr.splice(nextIndex, 1);
          }
        }
        return result;
    }
      
    /**
     *  The function used to remove room object from Global Object after given time frame.
     *  The function invocking from corn job.
     */
    removeRoomDetailsFromTableObject() {
        let indexs = this.tables.reduce(function(accumulator,currentValue,index) {
            if(timeLib.checkExpTime(currentValue.validity)) {
                 accumulator.push(index);         
            }     
            return accumulator;
       },[])
       // To delete object from Table array
       indexs.map(function(index) {
            //this.tables.splice(index, 1);
       });
    }

    objectId()
    {
        const os = require('os');
        const crypto = require('crypto');

        const seconds = Math.floor(new Date() / 1000).toString(16);
        const machineId = crypto.createHash('md5').update(os.hostname()).digest('hex').slice(0, 6);
        const processId = process.pid.toString(16).slice(0, 4).padStart(4, '0');
        const counter = process.hrtime()[1].toString(16).slice(0, 6).padStart(6, '0');

        return seconds + machineId + processId + counter;
    }
    checkPointActive(room, myPos , myRoom, gamePlayData)
    {
        let tab_pos = 0;
        let checkPointActivated = false;
        let table = myRoom;
        // for (let i = 0; i < this.tables.length; i++)
        // {
        //     if (this.tables[i].room == room)
        //     {
        //         tab_pos = i;
        //     }
        // }
        // console.log("checkPointActive 1 - ", tab_pos, myPos)
        for (let k = 0; k < table.users[myPos].tokens.length; k++)
        {
            // console.log("this.tables[tab_pos].users[myPos].tokens[k] - ", table.users[myPos].tokens[k])
            if (table.users[myPos].tokens[k] != -1)
            {

                let token_position = table.users[myPos].tokens[k];
                // console.log("token position - ", token_position, config.starPosition[0])
                if (token_position >= config.starPosition[0]) checkPointActivated = true;
                // console.log(
                //     'checkPointActivated',
                //     checkPointActivated,
                //     'token_position',
                //     token_position,
                // );

            }
        }
       // var gamePlayDataIndex = this.gamePlayData.findIndex((x) => x.room == room);
        //gamePlayData.data.checkpoint = checkPointActivated ? true : false;
        return {
            'checkPointActivated' : checkPointActivated,
            'table' : table,
            'gamePlayData' : gamePlayData
            };
    }
    getDataByRoom(room,myRoom) {
        let table = myRoom;
                var dt = new Date();
                dt.setSeconds(dt.getSeconds() + 4);
                for (let pl = 0; pl < table.users.length; pl++)
                {
                    if (table.users[pl].is_active)
                    {
                        table.current_turn = pl;
                        table.current_turn_type = 'roll';
                        table.turn_start_at = new Date().getTime(); 
                        table.game_started_at = new Date().getTime();
                        let DICE_ROLLED_RES = this.rollDice(room, table.users[pl].id,myRoom);
                        let DICE_ROLLED;
                        if(DICE_ROLLED_RES) {
                            myRoom = DICE_ROLLED_RES.table;
                            DICE_ROLLED = DICE_ROLLED_RES.returnDiceValue;
                        }

                        table.users[pl].turn = 1;

                        if (table.users[pl].dices_rolled.length == 0)
                        table.users[pl].dices_rolled.push(DICE_ROLLED);
                        var resObj = {
                            status: 1,
                            message: 'Done',
                            room: table.room,
                            table: table,
                            dice: DICE_ROLLED,
                            turn_start_at: config.turnTimer,
                            possition: pl,
                            default_diceroll_timer: config.turnTimer,                            
                        };
                        return resObj;
                    }
                }
        return false;
    }
}

module.exports = {
    _Tables,
};
