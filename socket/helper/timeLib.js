const moment    = require('moment');
const momenttz  = require('moment-timezone');
const timeZone  = 'Asia/Kolkata';

let now = () =>
{
    return moment.utc().format();
}

let getLocalTime = () =>
{
    return moment().tz(timeZone).format('YYYY-MM-DD HH:mm:ss');
}

let getCurrentTimeStamp = () =>
{
    return moment().tz(timeZone).unix();
}

let convertToLocalTime = (time) =>
{
    return momenttz.tz(time, timeZone).format('YYYY-MM-DD HH:mm:ss');
}

let calculateTime = (diff) =>
{
    const diffDuration = moment.duration(diff);
    return {
        days: diffDuration.days(),
        hours: diffDuration.hours(),
        minutes: diffDuration.minutes(),
        seconds: diffDuration.seconds()
    }
}

let calculateTimeDiff = (firstdatetime, seconddatetime) =>
{
    const diff = moment(seconddatetime, "DD/MM/YYYY HH:mm:ss").diff(moment(firstdatetime, "DD/MM/YYYY HH:mm:ss"));
    return diff;
}

let calculateExpTime = (time) =>
{
    let finaldatetime = moment().add(time, 's');
    return convertToLocalTime(finaldatetime);
}

let calculateTrackerTime = (input) =>
{
    let initialdatetime = moment(getLocalTime());
    let finaldatetime = moment(input);
    let counter = finaldatetime.diff(initialdatetime, 'seconds');
    return counter;
}

let checkExpTime = (time) =>
{
    let diff = momenttz.tz(time, timeZone).unix() - momenttz().tz(timeZone).unix();
    if (diff > 0)
    {
        return true;
    } else
    {
        return false;
    }
}

module.exports = {
    now: now,
    getLocalTime: getLocalTime,
    convertToLocalTime: convertToLocalTime,
    calculateTime: calculateTime,
    calculateExpTime: calculateExpTime,
    calculateTimeDiff: calculateTimeDiff,
    calculateTrackerTime: calculateTrackerTime,
    checkExpTime: checkExpTime,
    getCurrentTimeStamp: getCurrentTimeStamp
}