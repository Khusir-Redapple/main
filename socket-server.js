const express       = require('express');
const bodyParser    = require('body-parser');
const app           = express();
const router        = express.Router();
const http          = require('http');
const mongoose      = require('mongoose');
const morgan        = require('morgan');
const logger        = require('./api/service/logger');
let   cron          = require('node-cron');
const { v4: uuidv4} = require('uuid');
const RedisIo       = require("ioredis");
let   logDNA        = {};
let   schedulers    = {};
// Generate custom token 
morgan.token('host', function (req) {
    return req.hostname;
});
// setup the logger 
app.use(morgan(':method :host :url :status :res[content-length] - :response-time ms'));
// Appling acces rule for end user.
app.use(function (req, res, next)
{
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
    next();
});
require('./routes/index')(router);
app.use(
    bodyParser.urlencoded({
        extended: true,
        type: 'application/x-www-form-urlencoded'
    })
);
// Appling middelware.
app.use(bodyParser.json());
// Appling router.
app.use('/', router);
// Appling dummy hello route.
app.use('/hello', function (req, res)
{
    logger.info('404 Hit>', req.method, req.url, req.body);
});
// Creating server
const server = http.createServer(app);
const socket = require('socket.io')(server, {perMessageDeflate: false});

/**
 *	Server bootup section
 **/
try
{
    const AWS = require('aws-sdk');
    (async () =>
    {
        AWS.config = new AWS.Config();
        let AWS_REGION = process.env.AWS_REGION || 'ap-south-2';
        console.log("IAWS_REGION-", AWS_REGION)
        let ssm = new AWS.SSM({region: AWS_REGION});
        console.log('SSM===>', ssm.config);
        let Names = process.env.NODE_ENV != 'production' ? ["/staging/ludo/docdb/host", "/staging/ludo/docdb/password", "/staging/ludo/docdb/port", "/staging/ludo/docdb/username", "/staging/ludo/logDNA", "/staging/ludo/queueurl", "/staging/ludo/ludoapiurl", "/staging/ludo/ludoapiSecretkey"] : ["/prod/ludo/docdb/host", "/prod/ludo/docdb/password", "/prod/ludo/docdb/port", "/prod/ludo/docdb/username", "/prod/ludo/logDNA", "/prod/ludo/queueurl", "/prod/ludo/ludoapiurl", "/prod/ludo/ludoapiSecretkey"];
        let keys = [];
        const getParams = async (Names, i) =>
        {
            try
            {
                console.log("getParams called", Names.length, i)
                if (i < Names.length)
                {
                    const params = {
                        Name: Names[i],
                        WithDecryption: true,
                    };
                    console.table(`<<<< PARAMS >>>> ${params.Name} , ${typeof params.Name}`);
                    const result = await ssm.getParameter(params).promise();
                    console.log("[SSM Result] - ", result);
                    keys.push(result.Parameter.Value);
                    i++;
                    getParams(Names, i);
                }
                else
                {
                    // Read the value from SSM in AWS
                    process.env.DB_HOST = keys[0] ? keys[0] : process.env.DB_HOST;
                    process.env.DB_PASS = keys[1] ? keys[1] : process.env.DB_PASS;
                    process.env.DB_PORT = keys[2] ? keys[2] : process.env.DB_PORT;
                    process.env.DB_USER = keys[3] ? keys[3] : process.env.DB_USER;
                    process.env.DB_NAME = process.env.DB_NAME ? process.env.DB_NAME : 'nostra_playing';
                    // FOR logDNA
                    process.env.LOG_DNA_API_KEY = keys[4] ? keys[4] : process.env.LOG_DNA_API_KEY;
                    // FOR SQS URL
                    process.env.SQS_URL = keys[5] ? keys[5] : process.env.SQS_URL;
                    // FOR VERIFY USER URL
                    process.env.VERIFY_USER_URL = keys[6] ? keys[6] : process.env.VERIFY_USER_URL;
                    // API_SECRET_KEY for https://ludoapi.nostragamus.in/ludo/v1/ endpoints
                    process.env.API_SECRET_KEY = keys[7] ? keys[7] : process.env.API_SECRET_KEY;
                    // Moved here from top of file for availble logDNA apiKey. 
                    require('./socket')(socket);
                    let config = require('./config');
                    logDNA = require('./api/service/logDNA');
                    // DB Connect
                    setTimeout(function ()
                    {
                        let dbConnectionUrl = process.env.NODE_ENV != 'production' ? `mongodb://${process.env.DB_USER}:${process.env.DB_PASS}@${process.env.DB_HOST}:${process.env.DB_PORT}/${process.env.DB_NAME}` : `mongodb://${process.env.DB_USER}:${process.env.DB_PASS}@${process.env.DB_HOST}:${process.env.DB_PORT}/${process.env.DB_NAME}?ssl=true&ssl_ca_certs=rds-combined-ca-bundle.pem&replicaSet=rs0&readPreference=secondaryPreferred&retryWrites=false`;
                        // console.log("DB STRING - ", process.env.DB_USER, process.env.DB_PASS, process.env.DB_HOST, process.env.DB_USER, process.env.DB_PORT)
                        mongoose.set('useCreateIndex', true);
                        mongoose.connect(
                            `${dbConnectionUrl}`,
                            {useNewUrlParser: true, useFindAndModify: false},
                            d =>
                            {
                                if (d) return logger.info(`ERROR CONNECTING TO DB ${dbConnectionUrl}`, d, dbConnectionUrl);
                                logger.info(`Connected to ${process.env.NODE_ENV} database: `, `${dbConnectionUrl}`);
                                server.listen(config.port, async function (err)
                                {
                                    if (err) throw err;
                                    logger.info('Socket Server listening at PORT:' + config.port);       
                                        
                                        // make a connection to the instance of redis
                                        //const redis = await new RedisIo('redis://stage-ludo-redis-cache.qxdlkm.clustercfg.aps2.cache.amazonaws.com:6379');                                                                                                                    
                                        const redis = await new RedisIo(' redis-cli -h stage-ludo-redis-cache.qxdlkm.clustercfg.aps2.cache.amazonaws.com -p 6379');
                                        
                                        // let redisOptions = {};
                                        // redisOptions.scaleReads = 'master'
                                        // const redis = new RedisIo.Cluster(['redis://stage-ludo-redis-cache.qxdlkm.clustercfg.aps2.cache.amazonaws.com:6379'], redisOptions)

                                        redis.connect();                                  
                                        redis.on("error", (error) => {
                                            console.log(error);
                                        });
                                        redis.on("ready", function() { 
                                            console.log("Connected to Redis server successfully");  
                                        });                         
                                        // For corn job. 
                                        let task = cron.schedule('*/1 * * * *', () => {
                                        // console.log('Corn job running at every minutes');
                                        // To remove from Socket Object.
                                        let sckt = require('./socket/helper/sockets');
                                        new sckt.Sockets().removeSocketUserData();
                                        // To remove room details from Global Object.
                                        let roomObj = require('./socket/utils/_tables');
                                        new roomObj._Tables().removeRoomDetailsFromTableObject();
                                    },                                    
                                    {
                                        scheduled: true,
                                        timezone: 'Asia/Kolkata',
                                    }); 
                                    schedulers[`${uuidv4()}`] = task;                                  
                                    cron.getTasks();
                                    task.start();
                                });
                            }
                        );
                    }, 500)
                }
            } catch (error)
            {
                console.log("SSM Get Params error - ", error);
                // logger for logDNA
                let logData = {
                    level: 'debugg', //error and log are availble tag.
                    meta: error,
                  };
                logDNA.log('SSM Get Params error', logData);
            }
        }
        await getParams(Names, 0)
    })()


} catch (error)
{
    logger.info('DBCONNECT ERROR', error);
    // logger for logDNA
    let logData = {
        level: 'debugg', //error and log are availble tag.
        meta: error,
      };
    logDNA.log('DBCONNECT ERROR', logData);
}

module.exports = server;
