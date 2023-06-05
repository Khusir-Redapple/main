const config        = require('./../../config');
var {tableObject, gamePlayObject} = require('./tableObject');
const {sendMessage} = require('../../socket/controller/message_controllers');
const logDNA        = require('../../api/service/logDNA');
const timeLib       = require('../helper/timeLib');
const redisCache    = require('../../api/service/redis-cache');
const Table         = require('./../../api/models/table');
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
                //validity : timeLib.calculateExpTime(config.socketUserExpireTime),
                users: [],
                lobbyId: table.lobbyId,
                entryFee : entry_Fee,
                isGameCompleted : false,

            };
            let colour = [0, 1, 2, 3];
            // To setup prior dice value for users.
            let randomRumber;
            let shuffleNumberForOtherPlayer;

            for (var pl = 0; pl < 4; pl++)
            {
                let random_number = Math.floor(Math.random() * colour.length);
                let random_colour = colour[random_number];
                colour.splice(random_number, 1);
                // To generate random dice value range between 10 - 20
                const random = Math.floor(Math.random() * (20 - 10)) + 10;
                // To setup random number to 0 position index user.
                if(pl == 0) {
                    randomRumber = this.randomNumberGenerator(random);
                } else {
                    shuffleNumberForOtherPlayer = this.fisherShuffleGenerator(randomRumber);
                }                
                table_i.users[pl] = {
                    id: '',
                    numeric_id: '',
                    name: '',
                    profile_pic: '',
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
                    bonusPoints: 0,
                    moves: 0,
                    token_colour: random_colour,
                    diceValue : pl == 0 ? JSON.parse((JSON.stringify(randomRumber))) : JSON.parse((JSON.stringify(shuffleNumberForOtherPlayer)))
                };
            }
            await redisCache.addToRedis(table.room, table_i);
            //this.tables.push(table_i);
            resolve(table_i.room);
        });
    }

    // Check Seat Available
    // checkSeatAvailable(room)
    // {
    //     let count = 0;
    //     let noPlayers = 0;
    //     // New modification
    //     this.tables.reduce((accumulator, current) =>
    //     {
    //         if (current.room == room)
    //         {
    //             noPlayers = current.no_of_players;
    //             count = current.users.filter(users => users.is_active === true).length;
    //         }
    //         accumulator.push(current);
    //         return accumulator;
    //     }, []);

    //     let current_time = new Date().getTime();
    //     let time_diff = (current_time - (this.tables[i] ? this.tables[i].created_at : 0)) / 1000;

    //     return {flag: count < noPlayers, timerStart: 240 - time_diff};
    // }

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
        // new modification equivalent to above code.
        // let count, noPlayers, room = 0;
        // this.tables.reduce(function (accumulator, currentValue) {
        //     if (currentValue.lobbyId == lobbyId) {
        //         noPlayers = currentValue.no_of_players;
        //         count = currentValue.users.filter(users => users.is_active === true).length;
        //         room = currentValue.room;
        //     }
        //     accumulator.push(currentValue);
        //     return accumulator;
        // }, []);
        // if (count < noPlayers) return { room: room, timerStart: 60 };

        // return false;
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
        // for (var i = 0; i < this.tables.length; i++)
        // {
        //     if (this.tables[i].room == room)
        //     {
        //         let res = {
        //             status: true,
        //             start_at: parseInt(this.tables[i].turn_start_at),
        //             current_turn: this.tables[i].current_turn,
        //         };
        //         return res;
        //     }
        // }
        // let res = {
        //     status: false,
        // };
        // return res;

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
        // let index = this.tables.findIndex(function (data, i)
        // {
        //     return data.room == room
        // });

        // let filteredTable = this.tables.filter((x) => x.room == room);

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
                id: user._id,
                numeric_id: user.numeric_id,
                name: user.name,
                user_token : user.token,
                profile_pic: user.profilepic || config.default_user_pic,
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
                bonusPoints: 0,
                moves: 0,
                token_colour: filteredTable.users[pos].token_colour,
                diceValue : readDiceValue
            };
            // this.tables[index] = filteredTable[0];
            return {
                table: filteredTable,
                pos: pos,
            };
        }
        return false;
    }
    // setTableData(room, user)
    // {
    //     console.log("setTableData :: >>>", room, user.name, this.tables);
    //     // New modification
    //     this.table = this.tables.reduce(function (accumulator, currentValue)
    //     {
    //         if (currentValue.room == room)
    //         {
    //             let idx = currentValue.users.findIndex(element => element.id == user._id.toString());
    //             currentValue.users[idx].is_joined = true;
    //         }
    //         accumulator.push(currentValue);
    //         return accumulator;
    //     }, []);
    // }

    // tableInfo()
    // {
    //     console.log('AlreadyPlaying Started >>', this.tables.length);
    //     for (let i = 0; i < this.tables.length; i++)
    //     {
    //         console.log('totaltables', this.tables[i]);
    //     }
    // }

    //To check user already playing in another room / table
    // alreadyPlaying(id)
    // {
    //     for (let i = 0; i < this.tables.length; i++)
    //     {
    //         for (let pl = 0; pl < this.tables[i].users.length; pl++)
    //         {
    //             if (this.tables[i].users[pl].id)
    //             {
    //                 if (this.tables[i].users[pl].id.toString() == id.toString() && !this.tables[i].users[pl].is_left)
    //                 {
    //                     return true;
    //                 }
    //             }
    //         }
    //     }

    //     return false;

    // //     let data =  this.tables.reduce(function(acc,cur) {
    // //         let index = cur.users.findIndex(userDara => userDara.id.toString() == id.toString() && !userDara.is_left);
    // //         if(index == -1) {
    // //              return false;
    // //         }
    // //         return true;
    // //    },[]);
    // //    return false;
    
    // }
    alreadyPlayingTable(id, myRoom)
    {
        // for logDNA logger
        logger = {
            level: 'debugg',
            meta: this.tables
        };
        logDNA.log('If already playing This.tables', logger);

        // console.log('THIS.TABLES DATA :: ', this.tables[0].users);
        // for (var i = 0; i < this.tables.length; i++)
        // {
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
                        console.log('[alreadyPlayingTable]- ', curr_, myRoom.turn_start_at, 30 - diff, timeToAdd, diffT, timeToAdd - diffT);
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
        // }
        var rez = {
            status: 0,
            message: "An error was encountered. Please join a new game."
        };
        return rez;
    }

    getTokRoom(room, id, myRoom)
    {
        // console.log('getTokRoom Started >>', id);
        let table = myRoom;
        // for (var i = 0; i < this.tables.length; i++)
        // {
            // if (this.tables[i].room == room)
            // {
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
            // }
        // }
        var rez = {
            status: 0,
        };
        return rez;
    }

    // leaveIfPlaying(id)
    // {
    //     // console.log('AlreadyPlaying Started >>', id);
    //     for (var i = 0; i < this.tables.length; i++)
    //     {
    //         for (var pl = 0; pl < this.tables[i].users.length; pl++)
    //         {
    //             if (this.tables[i].users[pl].id)
    //             {
    //                 if (this.tables[i].users[pl].id.toString() == id.toString())
    //                 {
    //                     // console.log('You are playing on this table', this.tables[i]);
    //                     return this.tables[i].room;
    //                 }
    //             }
    //         }
    //     }
    //     return false;
    // }

    isRankOccupied(room, rank, myRoom)
    {
        var startDate = new Date();
        // var my_tab = this.tables.find((d) => d.room == room);
        let my_tab = myRoom;
        // console.log("table finding time in isRankOccupied", ((new Date()) - startDate));

        return my_tab.users.some((u) => u.rank == rank);
    }

    //Leave Room
    leave(room, id, myRoom)
    {   
        //let table = myRoom;
        console.log('Leave Room Started', id);
        // for (var i = 0; i < this.tables.length; i++)
        // {
            // console.log('TABLE FOUND - ',this.tables,id);
            // if (this.tables[i].room == room)
            // {
                console.log('myRoom - ', myRoom);
                for (var pl = 0; pl < myRoom.users.length; pl++)
                {
                    if (myRoom.users[pl].id.toString() == id.toString())
                    {
                        console.log('USER FOUND');
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
                            // console.log('Count-->', count);

                            // if (count == 0)
                            // {
                            //     this.tables.splice(i, 1);
                            // }

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

                            console.log('Players done: '+ myRoom.players_done);
                            return {
                                res: true,
                                position: pl,
                                rank: rank,
                            };
                        } else
                        {
                            myRoom.users[pl].is_left = true;
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
            // }
        // }
        // return {
        //     res: false,
        // };
    }

    // leaveIf(room, id)
    // {
    //     // console.log('Leave Room Started', id);
    //     for (var i = 0; i < this.tables.length; i++)
    //     {
    //         if (this.tables[i].room == room)
    //         {
    //             // console.log('TABLE FOUND');
    //             for (var pl = 0; pl < this.tables[i].users.length; pl++)
    //             {
    //                 if (this.tables[i].users[pl].id == id)
    //                 {
    //                     // console.log('USER FOUND');
    //                     if (this.tables[i].turn_start_at == 0)
    //                     {
    //                         this.tables[i].users[pl] = {
    //                             id: '',
    //                             numeric_id: '',
    //                             name: '',
    //                             profile_pic: '',
    //                             position: pl,
    //                             is_active: false,
    //                             is_done: false,
    //                             is_left: false,
    //                             rank: 0,
    //                             life: 0,
    //                             dices_rolled: [],
    //                             bonus_dice: 0,
    //                             six_counts: 0,
    //                             tokens: [0, 0, 0, 0],
    //                         };

    //                         return {
    //                             res: false,
    //                             flag: 1,
    //                         };
    //                     }

    //                 }
    //             }
    //             return {
    //                 res: false,
    //             };
    //         }
    //     }
    //     return {
    //         res: false,
    //     };
    // }
    //Start Game
    async tournamentStartGame(room, myRoom, gamePlayData)
    {
        // let table = myRoom;
        // for (var i = 0; i < this.tables.length; i++)
        // {
        //     if (this.tables[i].room === room)
        //     {
                var canStart = await this.canStartGame(myRoom);
                if (!canStart) return false;
                var dt = new Date();
                dt.setSeconds(dt.getSeconds() + 4);
                for (let pl = 0; pl < myRoom.users.length; pl++)
                {
                    if (myRoom.users[pl].is_active)
                    {
                        myRoom.current_turn = pl;
                        myRoom.current_turn_type = 'roll';
                        myRoom.turn_start_at = new Date(dt).getTime(); //new Date().getTime();
                        myRoom.game_started_at = new Date(dt).getTime();//new Date().getTime();
                        myRoom.server_time = new Date();
                        let DICE_ROLLED_RES = this.rollDice(room, myRoom.users[pl].id, myRoom);
                        //console.log('DICE_ROLLED_RES >>', JSON.stringify(DICE_ROLLED_RES));
                        let DICE_ROLLED;
                        if(DICE_ROLLED_RES) {
                            myRoom = DICE_ROLLED_RES.table;
                            DICE_ROLLED = DICE_ROLLED_RES.returnDiceValue;
                        }
                        myRoom.users[pl].turn = 1;

                        if (myRoom.users[pl].dices_rolled.length == 0)
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

            // }
        // }

        return false;
    }

    //Abort Game
    async abortGame(room)
    {
        for (var i = 0; i < this.tables.length; i++)
        {
            if (this.tables[i].room == room)
            {
                this.tables.splice(i, 1);
                console.log('SPLICED', this.tables);
            }
        }

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
        //var index = this.tables.findIndex((x) => x.room == room);
        // if (index >= 0)
        // {
        if(pos > -1)
        {
            if (myRoom.users[pos].dices_rolled.length > 0)
                myRoom.users[pos].dices_rolled = [];

            myRoom.users[pos].dices_rolled.push(DICE_ROLLED);
    }

        // }
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
        // for (let i = 0; i < this.tables.length; i++)
        // {
        //     if (this.tables[i].room == room)
        //     {
                for (let j = 0; j < myRoom.users.length; j++)
                {
                    if (myRoom.users[j].id == id)
                    {
                        if (myRoom.users[j].bonus_dice > 0) myRoom.users[j].bonus_dice--;
                    }
                }
            // }
        // }
    }

    addBonus(room, id, length, type, myRoom, gamePlayData)
    {
        // for (let i = 0; i < this.tables.length; i++)
        // {
        //     if (this.tables[i].room == room)
        //     {
                for (let j = 0; j < myRoom.users.length; j++)
                {
                    if (myRoom.users[j].id == id)
                    {
                        myRoom.users[j].bonus_dice += length;
                        console.log('Bonus updated', myRoom.users[j].bonus_dice);
                        //var gamePlayDataIndex = this.gamePlayData.findIndex((x) => x.room == room);
                        gamePlayData.data.extra_roll = 1
                        gamePlayData.data.extra_roll_count += 1
                        gamePlayData.data.extra_roll_reason.push(type)
                    }
                }
            // }
        // }

    }
    addBonusPoints(room, id, points, length, type, myRoom, gamePlayData)
    {
        let bonusPoint = points * length;
        // for (let i = 0; i < this.tables.length; i++)
        // {
        //     if (this.tables[i].room == room)
        //     {
                for (let j = 0; j < myRoom.users.length; j++)
                {
                    if (myRoom.users[j].id == id)
                    { 
                        console.log('Before Bonus Points updated- ', myRoom.users[j].bonusPoints);
                        myRoom.users[j].bonusPoints += bonusPoint;
                        console.log('After Bonus Points updated- ', myRoom.users[j].bonusPoints);
                        // To update pawn kill count
                        if(type == 'cut_bonus'){
                            if(myRoom.users[j].hasOwnProperty('pawnKillCount')){
                                myRoom.users[j].pawnKillCount = myRoom.users[j].pawnKillCount + 1;
                            } else {
                                myRoom.users[j].pawnKillCount = 1;
                            }
                        }
                    }
                }
            // }
        // }
       // var gamePlayDataIndex = this.gamePlayData.findIndex((x) => x.room == room);
       gamePlayData.data[type] = bonusPoint;
        if (type == 'home_base_bonus')
        {
            gamePlayData.data.home_base = 1;
            gamePlayData.data.home_base = 1;
        }
    }
    addSix(room, id, myRoom)
    {
        // for (let i = 0; i < this.tables.length; i++)
        // {
        //     // console.log("id we got", id)
        //     if (this.tables[i].room == room)
        //     {
                // console.log("room we got", room)
                for (let j = 0; j < myRoom.users.length; j++)
                {
                    // console.log("id we got", this.tables[i].users[j])
                    if (myRoom.users[j].id == id)
                    {
                        myRoom.users[j].six_counts += 1;
                        console.log('Six updated', myRoom.users[j].six_counts);
                    }
                }
            // }
        // }
    }

    setSix(room, id, myRoom)
    {
        // for (let i = 0; i < this.tables.length; i++)
        // {
        //     // console.log("id we got", id)
        //     if (this.tables[i].room == room)
        //     {
                // console.log("room we got", room)
                for (let j = 0; j < myRoom.users.length; j++)
                {
                    // console.log("id we got", this.tables[i].users[j].id,this.tables[i].users[j].six_counts)
                    if (myRoom.users[j].id == id)
                    {
                        myRoom.users[j].six_counts = 0;
                        console.log('Six updated', myRoom.users[j].six_counts);
                    }
                }
            // }
        // }
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
        if (!myRoom) return -1;
        const me = myRoom.users.find((elem) => elem.id == id);
        gamePlayData.data.roll.push(me ? me.dices_rolled[me.dices_rolled.length - 1] : -1);
        let a = me ? me.dices_rolled[me.dices_rolled.length - 1] : -1;
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
      console.log('updateCurrentTurn input ' + room + "_"+ pos+ "_"+ type+ "_"+prev+ "_"+move+ "_"+JSON.stringify(myRoom))
        // for (let i = 0; i < this.tables.length; i++)
        // {
        //     if (this.tables[i].room == room)
        //     {
                //for debugging.....
                console.log('updateCurrentTurn >>>:: ', myRoom.users[pos]);
               if(pos<0)
                  return;
                if (prev != -1)
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
                console.log('updateCurrentTurn res ' + JSON.stringify(myRoom))
            // }
        // }

    }
    updateCurrentTime(room, myRoom)
    {
        myRoom.turn_start_at = new Date().getTime();
        myRoom.turn_timestamp = new Date();
        console.log("Line 714 turn set : ", new Date().getTime(), new Date());
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
        // let me = myRoom.users[myPos];
        // gamePlayData.data.User = me.numeric_id;
        // gamePlayData.data.player_score = me.points + me.bonusPoints;

        // if('data' in gamePlayData) {
        //     await sendMessage(gamePlayData);
        // }
        await sendMessage(gamePlayData);
        //send through SQS
        await this.resetGamePlayData(room, myRoom, gamePlayData,myPos);
    }

    async resetGamePlayData(room, myRoom, gamePlayData, myPos)
    {
        // var index = this.tables.findIndex((x) => x.room == room);
        // if (index >= 0)
        // {
            // let user = myRoom.users[myPos];
            let user = myRoom.users[myRoom.current_turn];
            // console.log("Table >>", this.tables[index])
                gamePlayData.data.User = user.numeric_id,
                gamePlayData.data.turn = user.turn,
                gamePlayData.data.roll = [],
                gamePlayData.data.pawn = 0,
                gamePlayData.data.move = 0,
                gamePlayData.data.total_move = 0,
                gamePlayData.data.cut = 0,
                gamePlayData.data.cut_player = 0,
                gamePlayData.data.cut_pawn = 0,
                gamePlayData.data.cut_move = 0,
                gamePlayData.data.cut_bonus = 0,
                gamePlayData.data.home_base = 0,
                gamePlayData.data.home_base_bonus = 0,
                gamePlayData.data.extra_roll = 0,
                gamePlayData.data.extra_roll_count = 0,
                gamePlayData.data.extra_roll_reason = [],
                gamePlayData.data.checkpoint = 0,
                gamePlayData.data.player_score = user.points + user.bonusPoints,
                gamePlayData.data.points = 0,
                gamePlayData.data.life_lost = 3 - user.life,
                gamePlayData.data.lives_left = user.life,
                gamePlayData.data.pawn_positions = user.tokens,
                gamePlayData.data.game_time = 0,
                gamePlayData.data.room_id = room,
                gamePlayData.data.timestamp = new Date().getTime()
                await redisCache.addToRedis('gamePlay_'+room, gamePlayData);
        // }
    }
    clearDices(room, pos, myRoom)
    {
        let table = myRoom;
        table.users[pos].dices_rolled = [];
        return table;
         



        // console.log("in the clear divces");
        // for (let i = 0; i < this.tables.length; i++)
        // {
        //     if (this.tables[i].room == room)
        //     {
        //         this.tables[i].users[pos].dices_rolled = [];
        //     }
        // }
    }

    getNextPosition(room, pos, myRoom)
    {
        // New modification
        let table = myRoom;
        console.log("getNextPosition Room : " + JSON.stringify(myRoom));
        console.log("getNextPosition pos: " + pos);
        // let i = this.tables.findIndex(element => element.room == room);
        // if (i == -1)
        // {
        //     return -1;
        // }
        for (let j = pos + 1; j < table.users.length; j++)
        {
            if (table.users[j].is_active && !table.users[j].is_done)
            {
                console.log("getNextPosition j: " + j);
                return j;
            }
        }
        for (let j = 0; j < pos; j++)
        {
            if (table.users[j].is_active && !table.users[j].is_done)
            {
                console.log("getNextPosition j1: " + j);
                return j;
            }
        }
        return -1;
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
        console.log(
            'MAIN USER',
            myPos,
            'TOKEN',
            actual_token_position, // according to table calculated index
            'POSITION',
            table.users[myPos].tokens[token_index] // acual index
        );
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
                        console.log(
                            'KILLER',
                            'USER',
                            j,
                            'TOKEN',
                            table.users[j].tokens[k],
                            'POSITION',
                            other_token_position,
                            'safeZone',
                            table.users[j].tokens[k],
                            table.users[j].tokens[k] != config.starPosition[0]

                        );
                        if (other_token_position == actual_token_position && table.users[j].tokens[k] != config.starPosition[0])
                        {
                            dead_possible.push({
                                user: j,
                                token: k,
                            });
                        }
                    }
                }
            }
        }

        console.log('DEAD POSSIBLE', dead_possible);

        var us = [];
        let safe_user = []

        for (let i = 0; i < dead_possible.length; i++)
        {
            console.log("dead_possible.length : ", dead_possible.length)
            console.log("us : ", us, i)
            console.log("dead_possible[i].user : ", dead_possible[i].user)
            if (us.indexOf(dead_possible[i].user) > -1)
            {
                // dead_possible = dead_possible.filter((e) => e.user != dead_possible[i].user);
                safe_user.push(dead_possible[i].user)
                console.log("dead_possible : ", dead_possible, "safe_user >>", safe_user)
                // i = 0;
                // continue; 
            } else
            {
                console.log("else dead_possible[i].user : ", dead_possible[i].user)
                us.push(dead_possible[i].user);
            }
            // i++;
        }

        for (let i = 0; i < safe_user.length; i++)
        {
            for (let j = 0; j < dead_possible.length; j++)
            {
                console.log("safe_user[i] >>>>", i, safe_user[i], "dead_possible[j].user >>>>", j, dead_possible[j].user)
                dead_possible = dead_possible.filter((e) => safe_user[i] != e.user);
            }
        }

        //console.log('After loop DEAD POSSIBLE Tourney', dead_possible);
       // let gamePlayData = await redisCache.getRecordsByKeyRedis('gamePlay_'+room);
        if (dead_possible.length)
        {
           // var gamePlayDataIndex = this.gamePlayData.findIndex((x) => x.room == room);
           // this.gamePlayData[gamePlayDataIndex].data.cut = 1;

           gamePlayData.data.cut = 1;
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
            gamePlayData.data["cut_player " + i] = dead_possible[i].user;
            gamePlayData.data["cut_pawn " + i] = dead_possible[i].token;
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
                gamePlayData.data["cut_move " + i] = cutPoint + " - " + config.starPosition[0];
            }
            else
            {
                dead_possible[i].movebleBox = table.users[dead_possible[i].user].tokens[dead_possible[i].token];
                table.users[dead_possible[i].user].points -= table.users[dead_possible[i].user].tokens[dead_possible[i].token]; //commented above line and replace with this line
                table.users[dead_possible[i].user].tokens[dead_possible[i].token] = 0;
                dead_possible[i].tokenIndex = 0;
                gamePlayData.data["cut_move " + i] = dead_possible[i].movebleBox + " - 0"
                // added this line to store cut_player data.
                //gamePlayData.data["cut_player " + i] = dead_possible[i].user;
            }
            //console.log("My Points >>> ", table.users[myPos].points, table.users[dead_possible[i].user].points, table.users[dead_possible[i].user].tokens)
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

        // const table = this.tables.find((elem) => elem.room == room);
        const table = myRoom;
        // if (!table) return false;
        const me = table.users.find((elem) => elem.id == id);
        if (!me) return false;

        for (let k = 0; k < me.tokens.length; k++)
        {
            for (const dice_value of me.dices_rolled)
            {  // new implemention for pawn should't get chance to another move, If there is no enough index.
                if (me.tokens[k] + dice_value <= 56)
                {
                    return true;
                }
            }
        }

        return false;
    }

    // To get user dice rolled value
    // getDiceValue(room, id)
    // {
    //     const table = this.tables.find((elem) => elem.room == room);
    //     if (!table) return 0;
    //     const me = table.users.find((elem) => elem.id == id);
    //     if (!me) return 0;
    //     for (let k = 0; k < me.tokens.length; k++)
    //     {
    //         for (const dice_value of me.dices_rolled)
    //         {
    //             return dice_value;
    //         }
    //     }
    // }

    isMovePossibleExact(dice_value, room, id, token_index, myRoom)
    {
        const table = myRoom;
        // const table = this.tables.find((elem) => elem.room == room);        
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

    async setGameTime(myRoom)
    {
        //let gameStartTime = myRoom.game_started_at;
        let tableD = await Table.findOne({
            room: myRoom.room,
        });  
        console.log('GAMETIME====>',tableD);              
        let gameStartTime = tableD.game_started_at;
        // To convert New Date() getTime to Second.
        let time = (Math.round(new Date().getTime() / 1000) - Math.round(gameStartTime / 1000));
        let minutes = 0;
        let seconds = 0;
        if(time > 0) {
            let gameTime = config.gameTime * 60 - time;
            minutes = Math.floor(gameTime / 60);
            seconds = gameTime - minutes * 60;
        } 
        return minutes + ":" + seconds;
    }

    async makeMoveForTournament(dice_value, room, id, token_index, myRoom, gamePlayData)
    {
       const table = myRoom;
        // for (let i = 0; i < this.tables.length; i++)
        // {
        //     if (this.tables[i].room == room)
        //     {
                for (let j = 0; j < table.users.length; j++)
                {
                    if (table.users[j].id == id)
                    {
                        console.log('PENDING DICES BEFORE', table.users[j].dices_rolled, table.users[j].points, dice_value);

                        if (table.users[j].tokens[token_index] + dice_value <= 56)
                        {
                            table.users[j].tokens[token_index] += dice_value;
                            //Update points for tournament
                            table.users[j].points = table.users[j].points + dice_value;

                            table.users[j].dices_rolled.splice(
                                table.users[j].dices_rolled.indexOf(dice_value),
                                1
                            );
                            console.log('PENDING DICES AFTER', table.users[j].dices_rolled, table.users[j].points);

                            // var gamePlayDataIndex = this.gamePlayData.findIndex((x) => x.room == room);
                            gamePlayData.data.pawn = token_index + 1;
                            gamePlayData.data.move = gamePlayData.data.roll.length;
                            gamePlayData.data.points += dice_value;
                            gamePlayData.data.total_move += dice_value;
                            gamePlayData.data.player_score = table.users[j].points + table.users[j].bonusPoints;
                            gamePlayData.data.pawn_positions = table.users[j].tokens;
                            gamePlayData.data.game_time = await this.setGameTime(myRoom);
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
                            console.log('PENDING DICES AFTER', table.users[j].dices_rolled, table.users[j].points);
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
    EndOfTournament(room, amount, myRoom)
    {
        
            const table = myRoom;
            const pointArray = [];
            const winner = []
            
                for (let j = 0; j < table.users.length; j++)
                {
                    pointArray.push(table.users[j].points + table.users[j].bonusPoints);
                }
                console.log("pointArray >>>", pointArray)
                var maxPoints = (Math.max(...pointArray));
                console.log("maxPoints >>>", maxPoints)
                var count = 0;
                let point = pointArray;
                point.sort((a, b) => b - a);
                let otherRank;
                table.users.forEach(function (user)
                {
                    console.log("Points ....", user.points, user.bonusPoints, maxPoints, point)
                    if (user.points + user.bonusPoints == maxPoints)
                    {
                        count++,
                        otherRank = 1;
                    }
                    // else{
                    //     for(let j=1; j<=point.length; j++){
                    //         if(point[j] == user.points + user.bonusPoints) otherRank = j;
                    //     }
                    // }                     
                });
                // if(count > 1) amount = amount/count; //tie case
                //console.log('amount', amount);
                for (let k = 0; k < table.users.length; k++)
                {
                    for (let j = 0; j < point.length; j++)
                    {
                        //console.log("HERE - ", point[j], table.users[k].points + table.users[k].bonusPoints)
                        if (point[j] == table.users[k].points + table.users[k].bonusPoints) 
                        {
                            otherRank = j + 1;
                            while (this.isRankOccupied(room, otherRank, myRoom))
                            {
                                rank--;
                                if (rank == 1) break;
                            }
                        };
                    }
                    let winAmount = 0;
                    if (typeof amount != 'undefined' && otherRank == 1 && amount[1])
                    {
                        winAmount = otherRank == 1 ? amount[1] : 0;
                                               
                    } else if (typeof amount != 'undefined' && otherRank == 2 && amount[2])
                    {
                        winAmount = otherRank == 2 ? amount[2] : 0;              
                        
                    } else if (typeof amount != 'undefined' && otherRank == 3 && amount[3])
                    {
                        winAmount = otherRank == 3 ? amount[3] : 0;
                    }
                    //console.log("User's final rank ::::", otherRank)
                    if (table.users[k].points + table.users[k].bonusPoints == maxPoints)
                    {
                        table.players_won += 1;
                        table.players_done += 1;
                        table.users[k].is_done = true;
                        if(!table.users[k].rank || table.users[k].rank == 0) {
                            table.users[k].rank = 1;
                        }                        
                        winner.push({
                            player_index: table.users[k].position,
                            name: table.users[k].name,
                            numeric_id: table.users[k].numeric_id,
                            rank: table.users[k].rank,
                            id: table.users[k].id,
                            amount: winAmount,
                            score: table.users[k].points + table.users[k].bonusPoints
                        });
                    } else
                    {

                        table.players_done += 1;
                        table.users[k].is_done = true;
                        table.users[k].rank = otherRank;
                        winner.push({
                            player_index: table.users[k].position,
                            name: table.users[k].name,
                            numeric_id: table.users[k].numeric_id,
                            rank: otherRank,
                            id: table.users[k].id,
                            amount: winAmount,
                            score: table.users[k].points + table.users[k].bonusPoints
                        });
                    }
                }
                
                return {
                    'winner': winner,
                    'table' : table
                };
    }

    // EndOfTournamentV2(room, amount, myRoom)
    // {
    //         const table = myRoom;
    //         const activeUserPointArray = [];
    //         const nonActiveUserPointArray = [];
    //         const winner = [];
    //         let activeUserMap = new Map();
    //         let inactiveUserMap = new Map();
    //         let UserRankArray = new Map();
            
    //             for (let j = 0; j < table.users.length; j++)
    //             {
    //                 let totalScore = table.users[j].points + table.users[j].bonusPoints;
    //                 if (table.users[j].is_active && !table.users[j].hasOwnProperty("is_left")) {
    //                     activeUserMap.set(j, totalScore);
    //                     activeUserPointArray.push(totalScore);
    //                 } else {
    //                     inactiveUserMap.set(j, totalScore);
    //                     nonActiveUserPointArray.push(totalScore);
    //                 }
    //             }
    //             console.log({activeUserPointArray} , {activeUserMap}, {inactiveUserMap});
    //             //var maxPoints = (Math.max(...pointArray));
    //             activeUserPointArray.sort((a, b) => b - a);
    //             nonActiveUserPointArray.sort((a, b) => b - a);

    //             activeUserMap = new Map([...activeUserMap.entries()].sort((a, b) => b[1] - a[1]));
    //             inactiveUserMap = new Map([...inactiveUserMap.entries()].sort((a, b) => b[1] - a[1]));
    //             //let point = activeUserPointArray.concat(nonActiveUserPointArray);;
    //             // point.sort((a, b) => b - a);
    //             let otherRank = 0;
    //             let lastRank = 0;

    //             for (let [key, value] of activeUserMap) {
    //                 //let userPoints = table.users[key].points + table.users[key].bonusPoints;
    //                 let playerIndex = activeUserPointArray.indexOf(value);
    //                 let userRank = playerIndex + 1;
    //                 if (userRank > lastRank + 1) userRank--;
    //                 UserRankArray.set(key, userRank);
    //                 lastRank = userRank;
    //             }


    //             let maxRank = 0;
    //             for (let [key, value] of UserRankArray) {
    //                 if (value > maxRank ) {
    //                     maxRank = value;
    //                 }
    //             }

    //             for (let [key, value] of inactiveUserMap) {
    //                 //let userPoints = table.users[key].points + table.users[key].bonusPoints;
    //                 let playerIndex = nonActiveUserPointArray.indexOf(value);
    //                 let userRank = maxRank + playerIndex + 1;
    //                 if (userRank > lastRank + 1) userRank--;
    //                 UserRankArray.set(key, userRank);
    //                 lastRank = userRank;
    //             }


    //             let oneRankCounter = 0;
    //             let twoRankCounter = 0;
    //             let threeRankCounter = 0;

    //             for (let [key, value] of UserRankArray)
    //             {
    //                 if (value == 1) {
    //                     oneRankCounter++;
    //                 } else if (value == 2) {
    //                     twoRankCounter++;
    //                 }  else if (value == 3) {
    //                     threeRankCounter++;
    //                 } 
    //             }
    //             for (let k = 0; k < table.users.length; k++)
    //             {   
    //                 if(table.users[k].rank || table.users[k].rank == 0) {
    //                     table.users[k].rank = UserRankArray.get(k);
    //                 }
    //                 otherRank = table.users[k].rank;
    //                 //console.log('rankCOunt------------------->', UserRankArray);
    //                 let winAmount = 0;
    //                 if (typeof amount != 'undefined' && otherRank == 1 
    //                     && amount[1] && !table.users[k].hasOwnProperty("is_left"))
    //                 {
    //                     winAmount = otherRank == 1 ? Math.floor(amount[1]/(oneRankCounter == 0 ? 1 : oneRankCounter)) : 0;
    //                     //winAmount = otherRank == 1 ? parseFloat(amount[1]/(oneRankCounter == 0 ? 1 : oneRankCounter)).toFixed(2) : 0;
                                                    
    //                 } else if (typeof amount != 'undefined' && otherRank == 2 
    //                     && amount[2] && !table.users[k].hasOwnProperty("is_left"))
    //                 {
    //                     winAmount = otherRank == 2 ? Math.floor(amount[2]/(twoRankCounter == 0 ? 1 : twoRankCounter)) : 0;
    //                     //winAmount = otherRank == 2 ? parseFloat(amount[2]/(twoRankCounter == 0 ? 1 : twoRankCounter)).toFixed(2) : 0;              
                        
    //                 } else if (typeof amount != 'undefined' && otherRank == 3 
    //                     && amount[3] && !table.users[k].hasOwnProperty("is_left"))
    //                 {
    //                     winAmount = otherRank == 3 ? Math.floor(amount[3]/(threeRankCounter == 0 ? 1 : threeRankCounter)) : 0;
    //                     //winAmount = otherRank == 3 ? parseFloat(amount[3]/(threeRankCounter == 0 ? 1 : threeRankCounter)).toFixed(2) : 0;
    //                 }

    //                 table.players_won += 1;
    //                 table.players_done += 1;
    //                 table.users[k].is_done = true;
    //                 winner.push({
    //                         player_index: table.users[k].position,
    //                         name: table.users[k].name,
    //                         numeric_id: table.users[k].numeric_id,
    //                         rank: table.users[k].rank,
    //                         id: table.users[k].id,
    //                         amount: winAmount,
    //                         score: table.users[k].points + table.users[k].bonusPoints
    //                     });
    //             }
    //             return {
    //                 'winner': winner,
    //                 'table' : table
    //             };
    // }

    EndOfTournamentV2(room, amount, myRoom)
    {
            const table = myRoom;
            const activeUserPointArray = [];
            const nonActiveUserPointArray = [];
            const winner = [];
            let activeUserMap = new Map();
            let inactiveUserMap = new Map();
            let UserRankArray = new Map();
            let UserRankWiseAmount = new Map();
            
                for (let j = 0; j < table.users.length; j++)
                {
                    let totalScore = table.users[j].points + table.users[j].bonusPoints;
                    if (table.users[j].is_active && !table.users[j].hasOwnProperty("is_left")) {
                        activeUserMap.set(j, totalScore);
                        activeUserPointArray.push(totalScore);
                    } else {
                        inactiveUserMap.set(j, totalScore);
                        nonActiveUserPointArray.push(totalScore);
                    }
                }
                console.log({activeUserPointArray} , {activeUserMap}, {inactiveUserMap});
                //var maxPoints = (Math.max(...pointArray));
                activeUserPointArray.sort((a, b) => b - a);
                nonActiveUserPointArray.sort((a, b) => b - a);

                activeUserMap = new Map([...activeUserMap.entries()].sort((a, b) => b[1] - a[1]));
                inactiveUserMap = new Map([...inactiveUserMap.entries()].sort((a, b) => b[1] - a[1]));
                //let point = activeUserPointArray.concat(nonActiveUserPointArray);;
                // point.sort((a, b) => b - a);
                let otherRank = 0;

                for (let [key, value] of activeUserMap) {
                    let playerIndex = activeUserPointArray.indexOf(value);
                    let userRank = playerIndex + 1;
                    UserRankArray.set(key, userRank);
                }

                for (let [key, value] of inactiveUserMap) {
                    let playerIndex = nonActiveUserPointArray.indexOf(value);
                    let userRank = activeUserPointArray.length + playerIndex + 1;
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

                console.log('UserRankWiseAmount', UserRankWiseAmount, UserRankArray);

                for (let k = 0; k < table.users.length; k++)
                {   
                    table.users[k].rank = UserRankArray.get(k);
                    otherRank = table.users[k].rank;
                    console.log('Rank ------------------->', otherRank, UserRankWiseAmount.get(1));
                    let winAmount = 0;
                    if (typeof amount != 'undefined' && otherRank == 1 
                        && UserRankWiseAmount.get(1) && !table.users[k].hasOwnProperty("is_left"))
                    {
                        console.log('Rank 1 ------------------->', UserRankWiseAmount.get(1));
                        winAmount = otherRank == 1 ? Math.floor(UserRankWiseAmount.get(1)/(oneRankCounter == 0 ? 1 : oneRankCounter)) : 0;
                                                    
                    } else if (typeof amount != 'undefined' && otherRank == 2 
                        && UserRankWiseAmount.get(2) && !table.users[k].hasOwnProperty("is_left"))
                    {
                        console.log('Rank 2 ------------------->', UserRankWiseAmount.get(2));
                        winAmount = otherRank == 2 ? Math.floor(UserRankWiseAmount.get(2)/(twoRankCounter == 0 ? 1 : twoRankCounter)) : 0;            
                        
                    } else if (typeof amount != 'undefined' && otherRank == 3 
                        && UserRankWiseAmount.get(3) && !table.users[k].hasOwnProperty("is_left"))
                    {
                        console.log('Rank 3 ------------------->', UserRankWiseAmount.get(3));
                        winAmount = otherRank == 3 ? Math.floor(UserRankWiseAmount.get(3)/(threeRankCounter == 0 ? 1 : threeRankCounter)) : 0;
                    } else if (typeof amount != 'undefined' && otherRank == 4
                        && UserRankWiseAmount.get(4) && !table.users[k].hasOwnProperty("is_left"))
                    {
                        console.log('Rank 4 ------------------->', UserRankWiseAmount.get(4));
                        winAmount = otherRank == 4 ? Math.floor(UserRankWiseAmount.get(4)/(fourRankCounter == 0 ? 1 : fourRankCounter)) : 0;
                    }
                    console.log('Rank Wise Amount ------------------->', winAmount);

                    table.players_won += 1;
                    table.players_done += 1;
                    table.users[k].is_done = true;
                    winner.push({
                            player_index: table.users[k].position,
                            name: table.users[k].name,
                            numeric_id: table.users[k].numeric_id,
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
        // for (let i = 0; i < this.tables.length; i++)
        // {
        //     if (this.tables[i].room == room)
        //     {
                for (let j = 0; j < table.users.length; j++)
                {
                    if (table.users[j].id == id)
                    {
                        // console.log('Tokens:', this.tables[i].users[j].tokens);
                        for (var z = 0; z < 4; z++)
                        {
                            sum = sum + table.users[j].tokens[z];
                        }

                        if (sum == 224)
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
            // }
        // }
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
        console.log("calculateUserRank pointArray >>>", pointArray)
        var maxPoints = (Math.max(...pointArray));
        console.log("calculateUserRank maxPoints >>>", maxPoints)
        let point = pointArray;
        point.sort((a, b) => b - a);

        for (let k = 0; k < table.users.length; k++)
        {
            for (let j = 0; j < point.length; j++)
            {
                console.log("calculateUserRank HERE - ", point[j], table.users[k].points + table.users[k].bonusPoints)
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
        console.log("isThisTheEnd>> ", room, win_amount,myRoom)
        let table = myRoom;

        let rank = [];
        // for (let i = 0; i < this.tables.length; i++)
        // {
        //     if (this.tables[i].room == room)
        //     {
                for (let j = 0; j < table.users.length; j++)
                {
                    let amount = 0;
                    console.log("isThisTheEnd>>  table",table);
                    console.log("isThisTheEnd>>  1 cond",table.users[j].rank == 0);
                    console.log("isThisTheEnd>>  2nd cond",table.users[j].rank === 0);
                    console.log("isThisTheEnd>>  3rd cond",table.users[j].numeric_id != '');
                    if (table.users[j].rank === 0 && table.users[j].numeric_id != '')
                    {
                        console.log("isThisTheEnd>> j value ",j  );
                        console.log("isThisTheEnd>> j rank ",table.users[j].rank  );
                        console.log("isThisTheEnd>> j numeric_id ",table.users[j].numeric_id);
                        table = this.calculateUserRank(table.users[j], table);
                        console.log("isThisTheEnd>> My room", table)
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
                    console.log("for score >>>>", table.users[j])
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
                console.log("isThisTheEnd>> rank", room, JSON.stringify(rank));
                if (table.no_of_players == 2 || table.no_of_players == 3)
                {
                    if (table.players_won == 1 || table.players_done>=1)
                    {
                        //this.tables = this.tables.filter((t) => t.room != room);
                        //console.log('After Splice::', room);
                        //console.log('End rank::', rank);
                        //console.log('Tables::', this.tables);
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
                        //this.tables = this.tables.filter((t) => t.room != room);
                        //console.log("this.tables  >>0>", this.tables, rank)
                        return {
                            'rank' : rank,
                            'table' : table
                        };
                    } 
                    //else if (table.players_done >= 3 && table.players_won == 1)
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
                            // let amount = 0 ;
                            // if(typeof win_amount != 'undefined') amount =  this.tables[i].users[j].rank == 1 ? win_amount : 0;
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
                        // this.tables = this.tables.filter((t) => t.room != room);
                        // console.log("this.tables  >1>>", this.tables, rank)
                        return {
                            'rank' : rank,
                            'table' : table
                        };
                    } else return false;
                // }
            // }
        }
        return false;
    }

    checkOnlyPlayerLeft(room, myRoom)
    {
        // console.log('CHECKING PLAYERS LEFT');
        let table = myRoom;
        // for (let i = 0; i < this.tables.length; i++)
        // {
        //     if (this.tables[i].room == room)
        //     {
                console.log("checkOnlyPlayerLeft : Step 1: ")
                if (table.no_of_players - table.players_done == 1)
                {
                    console.log("checkOnlyPlayerLeft : Step 2: ")
                    for (let j = 0; j < table.users.length; j++)
                    {
                        // console.log('USER', this.tables[i].users[j]);
                        console.log("checkOnlyPlayerLeft : Step 3: ", table.users[j].is_active, !table.users[j].is_done, !table.users[j].is_left)
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
                            console.log('Rank received: ', rank);
                            if(!rank || rank<1)
                            {
                                rank=table.no_of_players;
                                console.log('Inside rank calc');
                                
                                while (this.isRankOccupied(room, rank, myRoom))
                                {
                                    
                                    console.log('Inside rank deduc');
                                    rank--;
                                    if (rank == 1) break;
                                }
                            }
                            table.users[j].rank=rank;
                            console.log('Rank alotted: ' +rank+  JSON.stringify(table.users[j]));
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
            // }
        // }
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
        // New modification with same result
        // this.tables = this.tables.reduce((prev, curr) =>
        // {
        //     if (curr.room == room)
        //     {
        //         let idx = curr.users.findIndex(element => element.id == id);
        //         curr.users[idx].life--;
        //     }
        //     prev.push(curr);
        //     return prev;
        // }, []);

        let idx = table.users.findIndex(element => element.id == id);
        table.users[idx].life--;


        // To update player life.
        // let gamePlayDataIndex = this.gamePlayData.findIndex((x) => x.room == room);

        //console.log("this.gamePlayData[gamePlayDataIndex].data.life_lost0 >", this.gamePlayData[gamePlayDataIndex].data.life_lost, this.gamePlayData[gamePlayDataIndex].data.lives_left)
        gamePlayData.data.life_lost += 1;
        gamePlayData.data.lives_left -= 1;
        return {
            'table' : table,
            'gameData' : gamePlayData
        }
        //console.log("this.gamePlayData[gamePlayDataIndex].data.life_lost1 >", this.gamePlayData[gamePlayDataIndex].data.life_lost, this.gamePlayData[gamePlayDataIndex].data.lives_left)

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
            let idx = table.users.findIndex(element => element.id == user_id);
            // To check if predefined dice value is empty then create set of dice value first.           
            if(table.users[idx].diceValue.length == 0) {
                // To generate random dice value range between 10 - 20
                const random = Math.floor(Math.random() * (20 - 10)) + 10;
                // To generate dice value between 10 to 20 range.
                randomNumber = this.randomNumberGenerator(random);
                // randomNumber = this.randomNumberGenerator(config.diceGenerateRange);
                table.users[0].diceValue = JSON.parse(JSON.stringify(randomNumber));
                let player_1 = this.fisherShuffleGenerator(randomNumber);
                table.users[1].diceValue = JSON.parse(JSON.stringify(player_1));
                let player_2 = this.fisherShuffleGenerator(randomNumber);
                table.users[2].diceValue = JSON.parse(JSON.stringify(player_2));
                let player_3 = this.fisherShuffleGenerator(randomNumber);
                table.users[3].diceValue = JSON.parse(JSON.stringify(player_3));
            }
             // pop from top of array and update the property value.
            returnDiceValue = table.users[idx].diceValue.shift();
            return {
                'returnDiceValue' : returnDiceValue,
                'table' : table,
            }

        } catch(exception) {
            logDNA.log('dice roll error', {level: 'debugg', meta: {room: room, userId: user_id}});
        }
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
        console.log("checkPointActive -- ")
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
            console.log("this.tables[tab_pos].users[myPos].tokens[k] - ", table.users[myPos].tokens[k])
            if (table.users[myPos].tokens[k] != -1)
            {

                let token_position = table.users[myPos].tokens[k];
                console.log("token position - ", token_position, config.starPosition[0])
                if (token_position >= config.starPosition[0]) checkPointActivated = true;
                console.log(
                    'checkPointActivated',
                    checkPointActivated,
                    'token_position',
                    token_position,
                );

            }
        }
       // var gamePlayDataIndex = this.gamePlayData.findIndex((x) => x.room == room);
        gamePlayData.data.checkpoint = checkPointActivated ? true : false;
        return {
            'checkPointActivated' : checkPointActivated,
            'table' : table,
            'gamePlayData' : gamePlayData
            };
    }
    getDataByRoom(room,myRoom) {
        let table = myRoom;
        // for (var i = 0; i < this.tables.length; i++)
        // {
        //     if (this.tables[i].room === room)
        //     {
                var dt = new Date();
                dt.setSeconds(dt.getSeconds() + 4);
                for (let pl = 0; pl < table.users.length; pl++)
                {
                    if (table.users[pl].is_active)
                    {
                        table.current_turn = pl;
                        table.current_turn_type = 'roll';
                        table.turn_start_at = new Date(dt).getTime(); 
                        table.game_started_at = new Date(dt).getTime();
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
            // }
        // }
        return false;
    }
}

module.exports = {
    _Tables,
};
