
var Service = require('../api/service');
var logger = require('../api/service/logger');

module.exports = function (router) {

	// router.get('*',function (req, res) {
    //     //logger.info("404 Hit");
    //     res.status(400);
    // });

    router.get('/health-check',function (req, res) {
        //logger.info("404 Hit");
        res.status(200).send('Health Check passed!');
    });
    
    
}