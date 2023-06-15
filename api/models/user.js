var mongoose = require('mongoose'),
    Schema = mongoose.Schema;
    
var UserModel = new Schema({
    name: {
        type: String,
        trim: true
    },
    numeric_id: {
        type: String,
        required: true
    },
    lobbyId : {
        type : String,
        required : true
    },
    profilepic: {
        type: String,
        trim: true
    },
    token: {
        type: String,
        required: true
    },
    joinedAt:{
        type: String,
        required: true
    },
    updatedAt : {
        type: String,
        default: '-1'
    }
});

var User = mongoose.model('User', UserModel);

module.exports = {
    User
};
