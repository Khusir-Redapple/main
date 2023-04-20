const config  = require('../../config');
const timeLib = require('../../socket/helper/timeLib');
const logDNA  = require('./logDNA');
const Redis   = require("ioredis");
const redis   = new Redis();
class RedisCache
{
    async addToRedis(id, data)
    {   
       try {
            redis.set(id, data, 'EX', config.socketUserExpireTime);
        } catch(exception) { 
            logDNA.log('add_user_socketData_to_redis', {level: 'error', meta: exception});
            return false;
        }
        return true;
    }

    async getRecordsByKeyRedis(id) {
        try {
            const value = redis.get(id);
            if(value) {
                return value;
            } 
            return false;          
        } catch(exception) {
            // log error to logDNA
            logDNA.log('add_user_socketData_to_redis', {level: 'error', meta: exception});
            return false;
        }
    }

    async removeDataFromRedis(id) {
        return redis.del(id)
    }
}

module.exports = new RedisCache();