const redisCache = require('../../api/service/redis-cache');
const config     = require('../../config');
const timeLib    = require('./timeLib');

class Sockets
{
    constructor()
    {
        //Create Map instance
        //this.currentUsers = new Map();
    }

    async updateSocket(id, socket)
    {   
        // New dictionary using MAP
        const userId = id.toString();
        let userDataSet = {
            data_id: userId,
            socket: socket.id,
            // socketIS: socket,
            status: 'online',
            last_seen: 0,
            validity : timeLib.calculateExpTime(config.socketUserExpireTime),
        }
        // // add and update based on condition.
        // if(this.currentUsers.has(id.toString())) {
        //     this.currentUsers.set(id.toString(),userDataSet);            
        // } else {
        //     this.currentUsers.set(id.toString(),userDataSet);
        // }
        // // return after add or updated.
        // return true;
        
        return await redisCache.addToRedis(userId, JSON.stringify(userDataSet));
    }

    async getSocket(id)
    {
        // for (let i = 0; i < this.currentUsers.length; i++)
        // {
        //     console.log("getSocket >>>", typeof this.currentUsers[i].data_id, typeof id, this.currentUsers[i].data_id.toString() == id.toString())
        //     if (this.currentUsers[i].data_id.toString() == id.toString())
        //     {
        //         return this.currentUsers[i].socket;
        //     }
        // }
        // return false;

        // if(this.currentUsers.has(id.toString())) {
        //     return this.currentUsers.get(id.toString()).socket;            
        // } else {
        //     return false;
        // }
        let  value = await redisCache.getRecordsByKeyRedis(id.toString());
        if(value) {
            value = JSON.parse(value);
            return value.socket;
        }
        return false;
    }

    async getSocketIS(id)
    {
        // for (let i = 0; i < this.currentUsers.length; i++)
        // {
        //     console.log(this.currentUsers[i].data_id, id, this.currentUsers[i].socketIS)
        //     if (this.currentUsers[i].data_id == id)
        //     {
        //         return this.currentUsers[i].socketIS;
        //     }
        // }
        // return false;

        let value = await redisCache.getRecordsByKeyRedis(id.toString());
        if(value) {
            value = JSON.parse(value);
            return value.socketIS;
        }
        return false;
    }

    async getStatus(id)
    {
        // for (let i = 0; i < this.currentUsers.length; i++)
        // {
        //     if (this.currentUsers[i].data_id.equals(id))
        //     {
        //         return {status: this.currentUsers[i].status, last_seen: this.currentUsers[i].last_seen};
        //     }
        // }
        // return false;

        // if(this.currentUsers.has(id.toString())) {
        //     return {
        //         status: this.currentUsers.get(id.toString()).status, 
        //         last_seen: this.currentUsers.get(id.toString()).last_seen
        //     };            
        // } else {
        //     return false;
        // }

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

    async userGone(socket)
    {
        // for (let i = 0; i < this.currentUsers.length; i++)
        // {
        //     if (this.currentUsers[i].socket == id)
        //     {
        //         this.currentUsers[i].status = 'offline';
        //         this.currentUsers[i].last_seen = new Date().getTime();
        //     }
        // }
       
        // for (const [key, value] of this.currentUsers.entries()) {
        //     if(value.socket == socket.toString()) {
        //         this.currentUsers.delete(key);
        //         break;
        //     }
        // }
        const token = await redisCache.getRecordsByKeyRedis(socket.id);
        if(token) {
            const user_id = await redisCache.getRecordsByKeyRedis(token);
            if(user_id) {
                redisCache.removeDataFromRedis(user_id);
            }
        } 
        
    }

   async getId(socket)
    {
        // for (let i = 0; i < this.currentUsers.length; i++)
        // {
        //     if (this.currentUsers[i].socket == socket)
        //     {
        //         return this.currentUsers[i].data_id.toString();
        //     }
        // }
        // return false;

        // Best for accessing both keys and their values
        // let flag = false;
        // for (const [key, value] of this.currentUsers.entries()) {
        //     if(value.socket == socket.toString()) {
        //         flag =  key.toString();
        //         break;
        //     }
        // }
        // return flag;

        // let user_id = await redisCache.getRecordsByKeyRedis(token);
        // if(user_id) {
        //     return user_id.toString();
        // }
        // return false;

        const token = await redisCache.getRecordsByKeyRedis(socket.id);
        if(token) {
            const user_id = await redisCache.getRecordsByKeyRedis(token);
            if(user_id) {
                return user_id.toString();
            }
        }
        return false;

    }

    /**
     * The method used to remove player data after given time. And method has called from corn job.
     */
    removeSocketUserData() {
        for (const [key, value] of this.currentUsers.entries()) {
            if(timeLib.checkExpTime(value.validity)) {
                this.currentUsers.delete(key);
            }
        }
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

module.exports = {Sockets};
