//Required module for SQS queue based messaging service
const aws               = require('aws-sdk');
aws.config              = new aws.Config();
aws.config.region       = process.env.AWS_REGION || 'ap-south-2';
const sqsAwsInstance    = new aws.SQS();
const QueueUrl          = 'https://sqs.ap-south-2.amazonaws.com/478885374249/stage-ludo.fifo';
const logDNA            = require('../../api/service/logDNA');

class QueueServices
{
    /**
     * Send message to sqs service
     * @param {params} params contains user data like token.
     */
    async sqsSendMessage(params)
    {

        // Setup the sendMessage parameter object
        const sendParamsToSqs = {
            MessageBody: JSON.stringify({
                order_id: Math.floor(Math.random() * 6) + 1,
                date: (new Date()).toISOString(),
            }),
            MessageGroupId: '0',
            MessageDeduplicationId: '0',
            QueueUrl: QueueUrl,
        };

        // To return a promise based on result.
        return new Promise((resolve, reject) =>
        {
            sqsAwsInstance.sendMessage(sendParamsToSqs, function (error, data)
            {
                if (error)
                {  
                    // for logDNA
                    logDNA.log('sqs insertions unsuccessfull', {level: 'error', meta: error});
                    reject(error);
                } else
                {
                    // for logDNA
                    logDNA.log('sqs insertion successfull', {level: 'debugg', meta: data});
                    resolve(data);
                }
            });
        });
    }

    async sqsReceiveMessage()
    {
        // Setup the receiveMessage parameters
        const params = {
            QueueUrl: QueueUrl,
            MaxNumberOfMessages: 10,
            VisibilityTimeout: 0,
            WaitTimeSeconds: 0,
        };
        return new Promise((resolve, reject) =>
        {
            sqsAwsInstance.receiveMessage(params, (error, data) =>
            {
                if (error)
                {
                    // for logDNA
                    logDNA.log('sqs receive unsuccessfull', {level: 'error', meta: error});
                    reject(error);
                } else if (!data.Messages)
                {
                    resolve('EmptyQueue');
                }
                // Data {
                //     ResponseMetadata: { RequestId: '79b4f744-d670-5f72-b43d-abe90f7b504b' },
                //     Messages: [
                //       {
                //         MessageId: '8fe39a0d-a52d-47b6-8564-c121f0546448',
                //         ReceiptHandle: 'AQEBcBn9OohuLYDY6cJEFi7DJhBgbkRqf/I9sHXVOlJgAObF7bVa+8AMSrAUuvAOhVeIr1tFHj+xgw/nQq1z/aVsrkeVelqdTlgYC3zD1jse+6m6sM/bQNDlbDB0RhDxWjb8ZSMWep5dfVnKmbEhRL9qb6PUXPdRWUK9tDXRRMWX7KLWCnKjXRyGwyxLSh+NS5SiHV37E3BrwUuJiAYu6y8HByClZ7TWqDw/rH4cVP4Ik4CTmbP49mqwlSIYxINH7CV1fyqgmlh6ZAYtnE1t0dA2S+MG+63R000Wxtl49H3Ubzs=',
                //         MD5OfBody: '3c72a00276fcaa1bd1b64899c1d24e12',
                //         Body: '{"order_id":1234,"date":"2023-04-10T09:13:55.439Z"}'
                //       }
                //     ]
                //   }
                resolve(data);
                // Now we must delete the message so we don't handle it again
                const deleteParams = {
                    QueueUrl: QueueUrl,
                    ReceiptHandle: data.Messages[0].ReceiptHandle,
                }
                sqsAwsInstance.deleteMessage(deleteParams, (error, data) =>
                {
                    if (error)
                    {
                        // for logDNA
                        logDNA.log('sqs delete unsuccessfull', {level: 'error', meta: error});
                    }
                });
            });
        });
    }
}

module.exports = new QueueServices();
