const config  = require('../../config');
const timeLib = require('../../socket/helper/timeLib');
const logDNA  = require('./logDNA');
const RedisIo   = require("ioredis");
// const redis =RedisIo.createClient('localhost:6379');      
// const redis = RedisIo.createClient(6379, 'staging-setup.avv3xf.0001.apse1.cache.amazonaws.com');
const redis = RedisIo.createClient(process.env.Redis_Url+':6379');

class RedisCache
{
    async addToRedis(id, data)
    {   
       try {
        if(typeof data == 'object')
            data=JSON.stringify(data);
        await redis.set(id, data, 'EX', config.socketUserExpireTime);
        } catch(err) { 
            let logData = {
                level: 'error',
                meta: { 'env' : `${process.env.NODE_ENV}`,'error': err, stackTrace : err.stack}
            };
            logDNA.error('addToRedis', logData);
            return false;
        }
        return true;
    }

    async getRecordsByKeyRedis(id) {
        const value = await redis.get(id);
        try {
            
            // if(value !== null && typeof value == 'object')
            //    value=JSON.parse(value);
            if(value) {
                return JSON.parse(value);
            } 
            return false;          
        } catch(err) {
            if(!value)
            {
                let logData = {
                    level: 'error',
                    meta: { 'env' : `${process.env.NODE_ENV}`,'error': err, stackTrace : err.stack,'value':value,'key':id }
                };
                logDNA.error('getRecordsByKeyRedis', logData);
           }
            return value;
        }
    }

    async removeDataFromRedis(id) {
        return await redis.del(id)
    }

    async incrFromRedis(id) {
        const res= await redis.incr(id)
        await redis.expire(id,config.socketUserExpireTime);
        return res;
    }
}

module.exports = new RedisCache();