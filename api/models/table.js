var mongoose = require('mongoose'),
    Schema = mongoose.Schema;

var TableModel = new Schema({
    room: {
        type: String,
        required: true
    },
    no_of_players: {
        type: Number
    },
    created_at: {
        type: Number
    },
    game_started_at: {
        type: String,
        default: '-1'
    },
    game_completed_at: {
        type: String,
        default: '-1'
    },
    room_fee: {
        type: Number
    },
    win_amount: {
        type: {Object}
    },
    totalWinning :{
        type: Number
    },
    isGameCompleted : {
        type: Boolean,
        default: false
    },
    players: [{
        id: {
            type: Schema.Types.ObjectId,
            required: true,
            ref: 'User'
        },
        rank: {
            type: Number,
            default: 0
        },
        fees:{
            type: Number,
            default: 0
        },
        pl:{
            type: Number,
            default: 0
        },  
        is_active:{
            type: Boolean,
            default: false
        }
    }],
});

module.exports = mongoose.model('Table', TableModel);