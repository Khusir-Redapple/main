class Sockets
{
    constructor()
    {
        //this.currentUsers = [];

        //Create Map instance
        this.currentUsers = new Map();
    }

    updateSocket(id, socket)
    {
        // let flag = false;
        // for (let i = 0; i < this.currentUsers.length; i++)
        // {
        //     if (this.currentUsers[i].data_id.equals(id))
        //     {
        //         flag = true;
        //         this.currentUsers[i].socket = socket.id;
        //         this.currentUsers[i].socketIS = socket;
        //         this.currentUsers[i].status = 'online';
        //         this.currentUsers[i].last_seen = 0;
        //     }
        // }

        // if (!flag)
        // {
        //     this.currentUsers.push({
        //         data_id: id,
        //         socket: socket.id,
        //         socketIS: socket,
        //         status: 'online',
        //         last_seen: 0
        //     });
        // }
        // return true;

        // New dictionary using MAP
        let userDataSet = {
            data_id: id,
            socket: socket.id,
            socketIS: socket,
            status: 'online',
            last_seen: 0,
            //Validity : new Date(); // 20 minuts add. node schud..
        }
        // add and update based on condition.
        if(this.currentUsers.has(id.toString())) {
            this.currentUsers.set(id.toString(),userDataSet);            
        } else {
            this.currentUsers.set(id.toString(),userDataSet);
        }
        // return after add or updated.
        return true;
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

        if(this.currentUsers.has(id.toString())) {
            return this.currentUsers.get(id.toString()).socket;            
        } else {
            return false;
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

        if(this.currentUsers.has(id.toString())) {
            return this.currentUsers.get(id.toString()).socketIS;            
        } else {
            return false;
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

        if(this.currentUsers.has(id.toString())) {
            return {
                status: this.currentUsers.get(id.toString()).status, 
                last_seen: this.currentUsers.get(id.toString()).last_seen
            };            
        } else {
            return false;
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

    getId(socket)
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
        let flag = false;
        for (const [key, value] of this.currentUsers.entries()) {
            if(value.socket == socket.toString()) {
                flag =  key.toString();
                break;
            }
        }
        return flag;

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
