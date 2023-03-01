const axios = require('axios').default;
const queryString = require('query-string');
const config = require('../../config')
var Service = require('../../api/service');
const logDNA   = require('../../api/service/logDNA');
async function call(path, method, body, headers = {}) {
    
    try{
        const url = process.env.VERIFY_USER_URL + path;
        let token = await Service.issueToken(body);
        console.log("PAth ::",path,url,body, 'Bearer ' + token , new Date())
        
        let apiResponce = await axios.request({
            url,
            method,
            data: body,
            headers:{ 
                "authorization": 'Bearer ' + token
            },
        });
        let data = apiResponce.data;
        console.log(path , " Data resp. is > ", data)
        if(data.isSuccess == true){
            return data;
        }
        else 
            return { isSuccess: false, error: data.error };

    } catch (err) {
        console.log(err);
        // for logDNA 
        var logData = {
            level: 'debugg',
            meta: err
          };        
        logDNA.log('verifyUserError', logData);
        return { isSuccess: false } ;

    }
}

function get(path, query, headers = {}) {
    if (query) {
        path += `?${queryString.stringify(query)}`;
    }
    return call(path,'GET', {}, headers);
}

function post(path, body, headers = {}) {
    return call(path,'POST', body, headers);
}



module.exports = {
    call,
    get,
    post
};
