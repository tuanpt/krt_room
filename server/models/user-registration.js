var UserRegistration = function(cnf) {
    this.email = cnf.email,
    this.firstName = cnf.firstName,
    this.lastName = cnf.lastName,
    this.password = cnf.pwd,
    this.passwordConfirm = cnf.pwdConfirm
};
module.exports = UserRegistration;