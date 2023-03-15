'use strict';

const {sqsSendMessage}  = require('../../api/operations/sqs_operations');
const {User}            = require('../../api/models/user');
const logDNA            = require('../../api/service/logDNA');
class MessageController
{

    /**
     * Send message from this route handler
     */
    async sendMessage(req)
    {
        try
        {
            let id = new Date().getTime();
            id = String(id);
            const params = {
                MessageBody: JSON.stringify(req.data),
                // MessageGroupId: id,
                // MessageDeduplicationId: id,
            };
            console.log("sendMessage data:: >", params);
            // JSON to object convert
            let parseData = JSON.parse(params.MessageBody);
            // db search for lobbyId
            let userData = await User.findOne({
                numeric_id: parseData.User
            });
            // To add lobbyId in existing object   
            parseData.lobbyId = userData.lobbyId;
            // To build final object
            let finalParams = {MessageBody: JSON.stringify(parseData)};
            console.log("after adding lobbyId sendMessage data:: >", finalParams)
            let result = await sqsSendMessage(finalParams);
            // for SQS Success
            let logData = {
                level: 'debugg',
                meta: result
            };
            logDNA.log('SQS sendMessage Success', logData);

            return result;
        } catch (error)
        {
            // for SQS Success
            let logData = {
                level: 'debugg',
                meta: error
            };
            logDNA.log('SQS sendMessage ERROR', logData);

            console.log("SQS sendMessage ERROR :: ", error)
            return false;
        }
    }
}

module.exports = new MessageController();