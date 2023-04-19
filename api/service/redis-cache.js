const config  = require('../../config');
const timeLib = require('./timeLib');
const Redis   = require("ioredis");
const redis   = new Redis();
class Sockets
{
    constructor()
    {
        //Create Map instance
        this.currentUsers = new Map();
    }

    async updateSocket(id, socket)
    {   
        // New dictionary
        let userDataSet = {
            data_id: id,
            socket: socket.id,
            socketIS: socket,
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


        // New implementation using redis cache
        try {
            let objToStr = JSON.stringify(userDataSet);
            console.log(objToStr);
            redis.set(id, objToStr, 'EX', 1200);
        } catch(Exception) {
            console.log(Exception);
            return false;
            // log error to logDNA
        }
        // return true;

        let data = await redis.get(id);        

    }

    getSocket(id)
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

        // For redis cache
        // the trick is to stringify the object
        try {
            if(redis.get(id)) {
                return redis.get(id).socket;
            } else {
                return false;
            }           
        } catch(exception) {
            return false;
            // log error to logDNA
        }
        
        
        
    }

    getSocketIS(id)
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

        // if(this.currentUsers.has(id.toString())) {
        //     return this.currentUsers.get(id.toString()).socketIS;            
        // } else {
        //     return false;
        // }

        // For redis cache
        try {
            if(redis.get(id)) {
                return redis.get(id).socketIS;
            } else {
                return false;
            }        
        } catch(exception) {
            return false;
            // log error to logDNA
        }
    }

    getStatus(id)
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

         // For redis cache
         try {
            if(redis.get(id)) {
                return {
                    status: redis.get(id).status,
                    last_seen: redis.get(id).last_seen
                }
            } else {
                return false;
            }        
        } catch(exception) {
            return false;
            // log error to logDNA
        }
    }

    userGone(socket)
    {
        // for (let i = 0; i < this.currentUsers.length; i++)
        // {
        //     if (this.currentUsers[i].socket == id)
        //     {
        //         this.currentUsers[i].status = 'offline';
        //         this.currentUsers[i].last_seen = new Date().getTime();
        //     }
        // }
       
        for (const [key, value] of this.currentUsers.entries()) {
            if(value.socket == socket.toString()) {
                this.currentUsers.delete(key);
                break;
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


        // const keys = await redis.keys('*')
        // if(keys){
        //     keys.map(async (ids) => {
        //         let RedisSocket = await redis.get(ids).socket;
        //         if(RedisSocket == socket){
        //             return ids;
        //         }
        //     })
        //     return false;
        // } else {
        //     return false;
        // }


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
