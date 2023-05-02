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
        } catch(exception) { 
            logDNA.log('add_user_socketData_to_redis', {level: 'error', meta: exception});
            return false;
        }
        return true;
    }

    async getRecordsByKeyRedis(id) {
        const value = await redis.get(id);
        try {
            
            // if(typeof value == 'object')
            //    value=JSON.parse(value);
            if(value) {
                return JSON.parse(value);

            } 
            return false;          
        } catch(exception) {
            // log error to logDNA
         //   logDNA.log('add_user_socketData_to_redis', {level: 'error', meta: exception});
            return value;
        }
    }

    async removeDataFromRedis(id) {
        return await redis.del(id)
    }

    async incrFromRedis(id) {
        return await redis.incr(id)
    }

    
}

module.exports = new RedisCache();