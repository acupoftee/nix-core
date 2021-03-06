const Rx = require('rx');

const Service = require('../models/service');

class UserService extends Service {
  /**
   * Attempt to find a member in a guild by a userString.
   *
   * The user string can be one of the following:
   * - a user mention: "<@!123132312412>" or"<@131231243142>"
   * - a userId: "131231243142"
   * - a user tag: "exampleUser#1234"
   *
   * @param guild {Guild}
   * @param userString {String}
   *
   * @return {Observable<null|GuildMember>}
   */
  findMember(guild, userString) {
    let userIdMatches = userString.match(/<@!?(\d+)>|^(\d+)$/);
    if (userIdMatches) {
      // We have a userId, let's get the user for that

      // Get one of the two matches
      let userId = userIdMatches[1] || userIdMatches[2];

      return Rx.Observable.of(guild.members.find((user) => user.id === userId));
    }

    //Ok, can't take the easy route, got to find them by their name
    let member = guild.members.find((member) => member.user.tag === userString);
    return Rx.Observable.of(member);
  }

  /**
   * Attempt to find a user in any guild by a userString.
   *
   * The user string can be one of the following:
   * - a user mention: "<@!123132312412>" or "<@131231243142>"
   * - a userId: "131231243142"
   * - a user tag: "exampleUser#1234"
   *
   * Note: Attempting to find a user by user tag is slow and unreliable. Finding
   * by mention or userId is preferred.
   *
   * @param userString {String}
   *
   * @return {Observable<null|User>}
   */
  findUser(userString) {
    let userIdMatches = userString.match(/<@!?(\d+)>|^(\d+)$/);

    if (userIdMatches) {
      // We have a userId, let's try to get the user for that

      // Get one of the two matches
      let userId = userIdMatches[1] || userIdMatches[2];
      return Rx.Observable.fromPromise(this.nix.discord.fetchUser(userId));
    }

    // check cached users first
    let user = this.nix.discord.users.find((user) => user.tag === userString);
    if (!user) {
      // not cached, try and find them in a guild
      this.nix.discord.guilds.forEach((guild) => {
        if (user) { return; } //if a user has been found skip the rest of the guilds
        let member = guild.members.find((member) => member.user.tag === userString);
        if (member) { user = member.user; }
      });
    }
    return Rx.Observable.of(user);
  }
}

module.exports = UserService;
