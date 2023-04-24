const redisCache = require('../../api/service/redis-cache');
const config     = require('../../config');
const timeLib    = require('./timeLib');
// create a Socket class
class Sockets
{
    /**
     * This method used to insert player socket object into redis-cache
     * @param {String} id means player db id.
     * @param {socketObject} socket player socket Object.
     * @returns boolean value
     */
    async updateSocket(id, socket)
    {   
        const userId = id.toString();
        // player object for cache
        let userDataSet = {
            data_id: userId,
            socket: socket.id,
            status: 'online',
            last_seen: 0
        }        
        return await redisCache.addToRedis(userId, JSON.stringify(userDataSet));
    }

    /**
     * The method used to return player socketID by user db id. 
     * @param {string} id means player db id.
     * @returns {string} socket id.
     */
    async getSocket(id)
    {
        let  value = await redisCache.getRecordsByKeyRedis(id.toString());
        if(value) {
            value = JSON.parse(value);
            return value.socket;
        }
        return false;
    }

    /**
     * The method used to return player socket Object by player db id.
     * @param {string} id 
     * @returns {socketObject} object.
     */
    async getSocketIS(id)
    {
        let value = await redisCache.getRecordsByKeyRedis(id.toString());
        if(value) {
            value = JSON.parse(value);
            return value.socketIS;
        }
        return false;
    }

    /**
     * The method used to return player status by player db id.
     * @param {string} id 
     * @returns {object} player object
     */
    async getStatus(id)
    {
        let value = await redisCache.getRecordsByKeyRedis(id.toString());
        if(value) {
            value = JSON.parse(value);
            return {
                'status' : value.status,
                'last_seen' : value.last_seen
            };
        }
        return false;
    }

    /**
     * This method used to remove records from redis cache.
     * @param {socketObject} socket means socketID.
     */
    async userGone(socket)
    {
        const token = await redisCache.getRecordsByKeyRedis(socket.id);
        if(token) {
            const user_id = await redisCache.getRecordsByKeyRedis(token);
            if(user_id) {
                redisCache.removeDataFromRedis(user_id);
            }
        } 
        
    }

    /**
     * This method used to return player id.
     * @param {socket} socket means socket id. 
     * @returns {string} player id.
     */
   async getId(socket)
    {
        const token = await redisCache.getRecordsByKeyRedis(socket);
        if(token) {
            const user_id = await redisCache.getRecordsByKeyRedis(token);
            if(user_id) {
                return user_id.toString();
            }
        }
        return false;
    }

    async sleep(ms)
    {
        return new Promise(resolve =>
        {
            setTimeout(() =>
            {
                resolve();
            }, ms);
        });
    }
}
// To export all method to application from this class 
module.exports = {Sockets};
