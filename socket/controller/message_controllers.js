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
            let result = await sqsSendMessage(params);
            // for SQS Success
            let logData = {
                level: 'debugg',
                meta: {'result' : result.message}
            };
            logDNA.log('SQS sendMessage Success', logData);

            return result;
        } catch (error)
        {
            // for SQS Success
            let logData = {
                level: 'error',
                meta: {'message' : error.message}
            };
            logDNA.log('SQS sendMessage ERROR', logData);
            return false;
        }
    }
}

module.exports = new MessageController();