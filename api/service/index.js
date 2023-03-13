const ObjectId  = require('mongoose').Types.ObjectId;
const jwt       = require('jsonwebtoken');

module.exports = {
    response: function (status, message, data)
    {
        return {
            status: status,
            message: message,
            data: data
        };
    },

    validateObjectId: function (id)
    {
        if (ObjectId.isValid(id))
        {
            var obj = new ObjectId(id);
            if (obj == id)
            {
                return true;
            }
        }
        return false;
    },

    randomNumber: async function (length)
    {
        return Math.floor(
            Math.pow(10, length - 1) + Math.random() * (Math.pow(10, length) - Math.pow(10, length - 1) - 1)
        );
    },
    
    issueToken: function (data)
    {
        console.log(typeof (data))
        if (typeof (data) != 'object') data = JSON.parse(data);
        //Reading JWT secret key from process.env.API_SECRET_KEY in SSM
        return jwt.sign(data, process.env.API_SECRET_KEY, {expiresIn: 604800});
    },
};
