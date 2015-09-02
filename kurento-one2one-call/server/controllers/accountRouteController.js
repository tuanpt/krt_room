var AccountRouteController = function() {
    AccountController = require('../controllers/account');
    UserController = require('../controllers/user');
    serRegistration = require('../models/user-registration');
    UserLogon = require('../models/user-logon');
    User = require('../models/user');
    ApiResponse = require('../models/api-response');
    UserPasswordReset = require('../models/user-pwd-reset');
    UserPasswordResetFinal = require('../models/user-pwd-reset-final');
    MailerMock = require('../test/mailer-mock.js');
    mailer = new MailerMock();
};
AccountRouteController.prototype.registerUser = function(sessionID, cnf, callback) {
    var accountController = new AccountController(User, sessionID, mailer);
    var userRegistration = cnf;
    var apiResponseStep1 = accountController.getUserFromUserRegistration(userRegistration);
    if (apiResponseStep1.success) {
        accountController.register(apiResponseStep1.extras.user, function(err, apiResponseStep2) {
            return callback(new ApiResponse({
                success: apiResponseStep2.success,
                extras: apiResponseStep2.extras
            }));
        });
    } else {
        return callback(new ApiResponse({
            success: apiResponseStep1.success,
            extras: apiResponseStep1.extras
        }));
    }
}
AccountRouteController.prototype.signinUser = function(sessionID, cnf, callback) {
    var accountController = new AccountController(User, sessionID, mailer);
    var userSignIn = cnf;
    accountController.logon(userSignIn.email, userSignIn.pwd, function(err, signInResponse) {
        return callback(new ApiResponse({
            success: signInResponse.success,
            extras: signInResponse.extras
        }));
    });
}
AccountRouteController.prototype.getAllUser = function() {
    var userController = new UserController(User);
    userController.readAllUsers(function(err, apiResponseAllUser) {
        var index;
        for (index in apiResponseAllUser) {
            console.log(apiResponseAllUser[index]);
        }
    });
}
AccountRouteController.prototype.readUserByEmail = function(email, callback) {
    var userController = new UserController(User);
    userController.readUserByEmail(email, function(err, readUserResponse) {
        return callback(new ApiResponse({
            success: readUserResponse.success,
            extras: readUserResponse.extras
        }));
    });
}
    // router.route('/account/logoff')
    //     .get(function (req, res) {
    //         var accountController = new AccountController(User, req.session, mailer);
    //         accountController.logoff();
    //         res.send(new ApiResponse({ success: true }));
    //     })
    //     .post(function (req, res) {
    //         var accountController = new AccountController(User, req.session, mailer);
    //         accountController.logoff();
    //         res.send(new ApiResponse({ success: true }));
    //     });
    // router.route('/account/resetpassword')
    //     .post(function (req, res) {
    //         var accountController = new AccountController(User, req.session, mailer);
    //         var userPasswordReset = new UserPasswordReset(req.body);
    //         accountController.resetPassword(userPasswordReset.email, function (err, response) {
    //             return res.send(response);
    //         });
    //     });
    // router.route('/account/resetpasswordfinal')
    //     .post(function (req, res) {
    //         var accountController = new AccountController(User, req.session, mailer);
    //         var userPasswordResetFinal = new UserPasswordResetFinal(req.body);
    //         accountController.resetPasswordFinal(userPasswordResetFinal.email, userPasswordResetFinal.newPassword, userPasswordResetFinal.newPasswordConfirm, userPasswordResetFinal.passwordResetHash, function (err, response) {
    //             return res.send(response);
    //         });
    //     });
module.exports = AccountRouteController;