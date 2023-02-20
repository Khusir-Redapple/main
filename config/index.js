const dotenv = require('dotenv');
const config =  function () {
    this.port = process.env.PORT || 3000;
    this.pre = process.env.PRE;
    this.pre = process.env.PRE;
    // console.log("DB STRING - ",  process.env.DB_USER,process.env.DB_PASS, process.env.DB_HOST, process.env.DB_USER, process.env.DB_PORT)
    // this.dbConnectionUrl = process.env.NODE_ENV != 'production' ? `mongodb://${process.env.DB_USER}:${process.env.DB_PASS}@${process.env.DB_HOST}:${process.env.DB_PORT}/${process.env.DB_NAME}` : `mongodb://${process.env.DB_USER}:${process.env.DB_PASS}@${process.env.DB_HOST}:${process.env.DB_PORT}/${process.env.DB_NAME}?ssl=true&ssl_ca_certs=rds-combined-ca-bundle.pem&replicaSet=rs0&readPreference=secondaryPreferred&retryWrites=false`; //process.env.MONGO_LOCAL;
    // this.dbConnectionUrl = `mongodb://localhost:27017/nostra_playing`; //process.env.MONGO_LOCAL;
    
    this.MOVE_PATH = [
        [
            1,
            2,
            3,
            4,
            5,
            6,
            7,
            8,
            9,
            10,
            11,
            12,
            13,
            14,
            15,
            16,
            17,
            18,
            19,
            20,
            21,
            22,
            23,
            24,
            25,
            26,
            27,
            28,
            29,
            30,
            31,
            32,
            33,
            34,
            35,
            36,
            37,
            38,
            39,
            40,
            41,
            42,
            43,
            44,
            45,
            46,
            47,
            48,
            49,
            50,
            51,
            52,
            53,
            54,
            55,
            56,
            57
        ],
        [
            14,
            15,
            16,
            17,
            18,
            19,
            20,
            21,
            22,
            23,
            24,
            25,
            26,
            27,
            28,
            29,
            30,
            31,
            32,
            33,
            34,
            35,
            36,
            37,
            38,
            39,
            40,
            41,
            42,
            43,
            44,
            45,
            46,
            47,
            48,
            49,
            50,
            51,
            58,
            1,
            2,
            3,
            4,
            5,
            6,
            7,
            8,
            9,
            10,
            11,
            12,
            59,
            60,
            61,
            62,
            63,
            64
        ],
        [
            27,
            28,
            29,
            30,
            31,
            32,
            33,
            34,
            35,
            36,
            37,
            38,
            39,
            40,
            41,
            42,
            43,
            44,
            45,
            46,
            47,
            48,
            49,
            50,
            51,
            58,
            1,
            2,
            3,
            4,
            5,
            6,
            7,
            8,
            9,
            10,
            11,
            12,
            13,
            14,
            15,
            16,
            17,
            18,
            19,
            20,
            21,
            22,
            23,
            24,
            25,
            65,
            66,
            67,
            68,
            69,
            70
        ],
        [
            40,
            41,
            42,
            43,
            44,
            45,
            46,
            47,
            48,
            49,
            50,
            51,
            58,
            1,
            2,
            3,
            4,
            5,
            6,
            7,
            8,
            9,
            10,
            11,
            12,
            13,
            14,
            15,
            16,
            17,
            18,
            19,
            20,
            21,
            22,
            23,
            24,
            25,
            26,
            27,
            28,
            29,
            30,
            31,
            32,
            33,
            34,
            35,
            36,
            37,
            38,
            71,
            72,
            73,
            74,
            75,
            76
        ]
    ];

    this.safeZone = [1, 14, 27, 40, 22];
    this.starPosition  = [21];
    this.gameTime = 15; //15;
    this.turnTimer = 10; // Dice roll time, 10 sec.
    this.countDownTime = 30; // previously it was 10 sec
    this.pawnMoveTimer = 0.08;
    this.noOfPlayersInTournament = [2, 3, 4];
    this.SERVICE_ENDPOINT_MAPPING = process.env.ENDPOINT_MAPPING ? process.env.ENDPOINT_MAPPING :'http://ludoapi.nostragamus-stage.in/ludo/v1/',
    //this.apiSecret = 'wHlkdSHPmwalKdMSZpqglsJVUWInyueAXXdashjdbhbshdcasDWpfHT9Lord5hIvA';
    this.apiSecret = 'bTF07U8mdS0XCu8ayywRfRlp3/IepPR9CQrIAwc0';
    this.VISIBILITY_TIMEOUT = 600;
    // this.QUEUE_URL = 'https://sqs.ap-south-1.amazonaws.com/478885374249/gamePlayDataQueue';
    // this.QUEUE_URL = 'https://sqs.ap-south-1.amazonaws.com/478885374249/stage-ludo-game-events';
    this.QUEUE_URL = 'https://sqs.ap-south-2.amazonaws.com/478885374249/stage-ludo-game-events';
};

module.exports = new config();