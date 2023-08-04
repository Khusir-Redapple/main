const axios         = require('axios').default;
const queryString   = require('query-string');
const Service       = require('../../api/service');
const logDNA        = require('../../api/service/logDNA');

async function call(path, method, body, headers = {})
{
    try
    {
        const url = process.env.VERIFY_USER_URL + path;
        let token = await Service.issueToken(body);
        // console.log("PAth ::", path, url, body, 'Bearer ' + token, new Date());
        // for logDNA 
        var logData = {
            level: 'debugg',
            meta: {
                "url": url,
                "path": path
            }
        };
        logDNA.log('verifyUser_url', logData);

        let apiResponce = await axios.request({
            url,
            method,
            data: body,
            headers: {
                "authorization": 'Bearer ' + token
            },
        });
        let data = apiResponce.data;
        // console.log(path, " Data resp. is > ", data);
        if (data.isSuccess == true)
        {
            return data;
        }
        else
            return {isSuccess: false, error: data.error};

    } catch (err)
    {
        let logData = {
            level: 'error',
            meta: { 'env' : `${process.env.NODE_ENV}`,'error': err, stackTrace : err.stack}
        };
        logDNA.error('call', logData);
        return {isSuccess: false};

    }
}

function get(path, query, headers = {})
{
    if (query)
    {
        path += `?${queryString.stringify(query)}`;
    }
    return call(path, 'GET', {}, headers);
}

function post(path, body, headers = {})
{
    return call(path, 'POST', body, headers);
}

module.exports = {
    call,
    get,
    post
};
