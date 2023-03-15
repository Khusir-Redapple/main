module.exports = function (router) {
    router.get('/health-check',function (req, res) {
        res.status(200).send('Health Check passed!');
    });
}