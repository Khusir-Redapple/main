'use strict';

/*** Required module for SQS queue based messaging service */
const aws       = require('aws-sdk');
aws.config      = new aws.Config();
aws.config.region = process.env.AWS_REGION || 'ap-south-2';
console.log("aws config - ", aws.config);
const sqsAwsInstance = new aws.SQS();

const commonQueueParams = {
    QueueUrl: process.env.SQS_URL,
};

class MessageOperations
{

    constructor()
    {
        this.sqsSendMessage = this.sqsSendMessage.bind(this);
    }

    /**
    * Send message to sqs service
    * @param {params} params 
    */
    async sqsSendMessage(params)
    {
        return new Promise((resolve, reject) => {
            params = {...commonQueueParams, ...params};
            sqsAwsInstance.sendMessage(params, function (error, data)
            {
                if (error) {
                    reject(error);
                } else {
                    resolve(data);
                }
            });
        });
    }
}

module.exports = new MessageOperations();
