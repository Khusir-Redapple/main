// Initialized .env environment.
require('dotenv').config();
// config function declaration
class config
{
    constructor()
    {
        // The server port where application will run.
        this.port = process.env.PORT || 3000;
        // Pawn move path
        this.MOVE_PATH = [
            [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39, 40, 41, 42, 43, 44, 45, 46, 47, 48, 49, 50, 51, 52, 53, 54, 55, 56, 57],
            [14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39, 40, 41, 42, 43, 44, 45, 46, 47, 48, 49, 50, 51, 58, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 59, 60, 61, 62, 63, 64],
            [27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39, 40, 41, 42, 43, 44, 45, 46, 47, 48, 49, 50, 51, 58, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 65, 66, 67, 68, 69, 70],
            [40, 41, 42, 43, 44, 45, 46, 47, 48, 49, 50, 51, 58, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 71, 72, 73, 74, 75, 76]
        ];
        this.diceGenerateRange = 18; // No. of dice value generate at the time of game start for each player
        this.safeZone = [1, 14, 27, 40, 22, 35, 9, 48]; // Pawn safe Zone.
        this.starPosition = [21]; // Pawn start position.
        this.gameTime = 2; // Game EndTime is 10 minutes.
        this.turnTimer = 10; // Dice roll time 10 sec.
        this.countDownTime = 30; // previously it was 10 sec.
        this.pawnMoveTimer = 0.08; // Pawn move timer.
        this.noOfPlayersInTournament = [2, 3, 4]; //Game start if number of player matches in array value.
        this.socketUserExpireTime = 180; // in seconds format 20 minutes equal to 1200 sec
    }
}
// Export the function to entire project.
module.exports = new config();