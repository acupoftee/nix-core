const Observable = require('rxjs').Observable;
const Discord = require('discord.js');

class Response {
  constructor(message, type = 'message', content = '', embed = null) {
    this._message = message;

    this.type = type;
    this.content = content;
    this._embed = embed;
  }

  get embed() {
    if (!this._embed) {
      this._embed = new Discord.RichEmbed();
      return this._embed;
    }
    else if (this._embed instanceof Discord.RichEmbed) {
      return this._embed;
    }
    else {
      this._embed = new Discord.RichEmbed(this._embed);
      return this._embed;
    }
  }

  set embed(value) {
    this._embed = value;
  }

  /**
   * Sends this response in the specified format
   *
   * @return {Observable}
   */
  send(data) {
    if (data) {
      if (data.type) {this.type = data.type;}
      if (data.content) {this.content = data.content;}
      if (data.embed) {
        this.type = 'embed';
        this.embed = data.embed;
      }
    }

    switch (this.type) {
      case 'none':
        return Observable.empty();
      case 'reply':
        return Observable.fromPromise(this._message.reply(this.content));
      case 'message':
        return Observable.fromPromise(this._message.channel.send(this.content));
      case 'embed':
        return Observable.fromPromise(this._message.channel.send(this.content, { embed: this.embed }));
      case 'dm':
        return Observable.fromPromise(this._message.author.send(this.content));
      default:
        return Observable.throw('Unknown response type ' + this.type);
    }
  }
}

module.exports = Response;
