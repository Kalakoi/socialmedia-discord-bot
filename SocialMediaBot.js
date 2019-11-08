const https = require("https"),
	fs = require("fs"),
	Discord = require("discord.js"),
	bot = new Discord.Client({autoReconnect: true}),
	logPath = __dirname + "/log",
	channelPath = __dirname + "/channels",
	settingsPath = __dirname + "/settings";
var servers = [];
var settings;
var sentBirthdays = false;
var logs = [];

function leadingZero(d){
	if(d < 10) {
		return "0" + d;
	} else {
		return d;
	}
}

function print(msg, err) {
	var date = new Date();
	var h = leadingZero(date.getHours());
	var m = leadingZero(date.getMinutes());
	var s = leadingZero(date.getSeconds());
	
	var timestamp = "[" + h + ":" + m + ":" + s + "]";
	if(msg) {
		console.log(timestamp, msg);
	
		//newLog = {time: timestamp, message: msg};
		//logs.push(newLog);
	}
	
	if(err) {
		console.log(timestamp, err);
		//errLog = {time: timestamp, message: err};
		//logs.push(errLog);
	}
}

function indexOfObjectByName(array, value) {
	for(let i = 0; i < array.length; i++) {
		if(array[i].name.toLowerCase().trim() === value.toLowerCase().trim()) {
			return i;
		}
	}
	return -1;
}

function exitHandler(opt, err) {
	if(err) {
		print(`Exception: ${err}`);
		print(`Message: ${err.message}`);
		print(`File: ${err.fileName}`);
		print(`Line: ${err.lineNumber}`);
	}
	if(opt.save) {
		print("Saving channels to " + channelPath + " before exiting");
		//print(JSON.stringify(servers));
		fs.writeFileSync(channelPath, JSON.stringify(servers, null, 4));
		print("Saving logs to " + logPath + " before exiting");
		fs.writeFileSync(logPath, JSON.stringify(logs, null, 4));
		print("Done");
	}
	if(opt.exit) {
		process.exit();
	}
}

process.on("exit", exitHandler.bind(null, {save:true}));
process.on("SIGINT", exitHandler.bind(null, {exit:true}));
process.on("SIGTERM", exitHandler.bind(null, {exit:true}));
process.on("uncaughtException", (err) => {exitHandler.bind(null, {exit:true}, err);});

function callTwitchApi(server, twitchChannel, callback, getStreamInfo) {
	var opt;
	try {
		var apiPath;
		if(getStreamInfo) {
			//apiPath = "/kraken/streams/" + twitchChannel.name.trim();
			apiPath = "/helix/streams?user_id=" + twitchChannel.id.trim();
		} else {
			//apiPath = "/kraken/channels/" + twitchChannel.name.trim();
			apiPath = "/helix/users?login=" + twitchChannel.name.trim();
		}
		opt = {
			host: "api.twitch.tv",
			path: apiPath,
			headers: {
				"Client-ID": settings.twitchClientID,
				Accept: "application/vnd.twitchtv.v3+json"
			}
		};
	} catch(err) {
		print(err);
		return;
	}

	https.get(opt, (res) => {
		var body = "";

		res.on("data", (chunk) => {
			body += chunk;
		});

		res.on("end", () => {
			var json;
			try {
				json = JSON.parse(body);
			} catch(err) {
				print(err);
				return;
			}
			if(json.status == 404) {
				callback(server, undefined, undefined);
			} else {
				callback(server, twitchChannel, json);
			}
		});

	}).on("error", (err) => {
		print(err);
	});
}

function twitchApiCallback(server, twitchChannel, res) {
	if(res && !twitchChannel.online && res.data[0].type && res.data[0].started_at > twitchChannel.timestamp) { 
		try {
			var channels = [], defaultChannel;
			var guild = bot.guilds.find("name", server.name);

			if(server.discordChannels.length === 0) {
				defaultChannel = guild.channels.find("type", "text");
			} else {
				for(let i = 0; i < server.discordChannels.length; i++) {
					channels.push(guild.channels.find("name", server.discordChannels[i]));
				}
			}
			var embed = new Discord.RichEmbed()
				.setColor("#6441A4")
				.setTitle(res.data[0].user_name.replace(/_/g, "\\_"))
				.setURL(res.stream.channel.url)
				.setDescription("**" + res.data[0].title + "**\n" + res.stream.game)
				.setImage(res.data[0].thumbnail_url)
				//.setThumbnail(res.stream.channel.logo)
				//.addField("Followers", res.stream.channel.followers, true)
				.addField("Viewers", res.data[0].viewer_count, true)
				.setFooter("Twitch", "https://4shoreg.files.wordpress.com/2015/04/twitch.png");

			if(channels.length !== 0) {
				for(let i = 0; i < channels.length; i++) {
					channels[i].send(embed).then(
						print("Sent Twitch embed to channel '" + channels[i].name + "' on server '" + server.name + "'."));
				}
				twitchChannel.online = true;
				twitchChannel.timestamp = res.data[0].started_at;
			} else if(defaultChannel) {
				defaultChannel.send(embed).then(
					print("Sent Twitch embed to channel '" + defaultChannel.name + "' on server '" + server.name + "'."));
				twitchChannel.online = true;
				twitchChannel.timestamp = res.data[0].started_at;
			}
		} catch(err) {
			print(err);
		}
	} else if(res.stream === null) {
		twitchChannel.online = false;
	}
}

function callTwitterApi(server, twitterFeed, callback) {
	var opt;
	try {
		var apiPath = "/1.1/statuses/user_timeline.json?count=1&include_rts=false&screen_name=" + twitterFeed.name.trim();
		opt = {
			host: "api.twitter.com",
			path: apiPath,
			headers: {
				Authorization: "Bearer " + settings.twitterBearerToken,
				Accept:"application/json"
			}
		};
	} catch(err) {
		print(err);
		return;
	}

	https.get(opt, (res) => {
		var body = "";

		res.on("data", (chunk) => {
			body += chunk;
		});

		res.on("end", () => {
			var json;
			try {
				json = JSON.parse(body);
			} catch(err) {
				print(err);
				return;
			}
			if(json.status == 404) {
				callback(server, undefined, undefined);
			} else {
				callback(server, twitterFeed, json);
			}
		});
	}).on("error", (err) => {
		print(err);
	});
}

function twitterApiCallback(server, twitterFeed, res) {
	if(res && new Date(res[0].created_at) > new Date(twitterFeed.timestamp) && res[0].in_reply_to_status_id == null) {
		try {
			var channels = [], defaultChannel;
			var guild = bot.guilds.find("name", server.name);

			if(server.discordChannels.length === 0) {
				defaultChannel = guild.channels.find("type", "text");
			} else {
				for(let i = 0; i < server.discordChannels.length; i++) {
					channels.push(guild.channels.find("name", server.discordChannels[i]));
				}
			}
			var displayMessage  = res[0].text;
			for (l = 0; l < res[0].entities.urls.length; l++) {
				displayMessage = displayMessage.replace(res[0].entities.urls[l].url, res[0].entities.urls[l].expanded_url);
			}
			if (res[0].entities.media) {
				for (l = 0; l < res[0].entities.media.length; l++) {
					displayMessage = displayMessage.replace(res[0].entities.media[l].url, "");
				}
			}
			var embed = new Discord.RichEmbed()
				.setColor("#00aced")
				.setTitle(res[0].user.name + " (@" + res[0].user.screen_name + ")")
				.setURL("https://twitter.com/" + res[0].user.screen_name + "/status/" + res[0].id_str)
				.setDescription(displayMessage.replace("&amp;","&"))
				.setThumbnail(res[0].user.profile_image_url)
				.setFooter("Twitter","http://icons.iconarchive.com/icons/uiconstock/socialmedia/512/Twitter-icon.png");
			if (res[0].entities.media) {
				embed.setImage(res[0].entities.media[0].media_url);
			}
			
			embed.addField("Followers", res[0].user.followers_count, true);

			if(channels.length !== 0) {
				for(let i = 0; i < channels.length; i++) {
					channels[i].send(embed).then(
						print("Sent Twitter embed to channel '" + channels[i].name + "' on server '" + server.name + "'."));
				}
				twitterFeed.timestamp = res[0].created_at;
			} else if(defaultChannel) {
				defaultChannel.send(embed).then(
					print("Sent Twitter embed to channel '" + defaultChannel.name + "' on server '" + server.name + "'."));
				twitterFeed.timestamp = res[0].created_at;
			}
		} catch(err) {
			print(err);
		}
	}
}

function callYouTubeApi(server, youTubeChannel, callback, getChannelInfo) {
	var opt;
	try {
		var apiPath = "";
		if (getChannelInfo) {
			apiPath = "/youtube/v3/channels?part=snippet%2CcontentDetails&maxResults=1&forUsername=" + youTubeChannel.name.trim();
		} else {
			apiPath = "/youtube/v3/activities?part=snippet%2CcontentDetails&channelId=" + youTubeChannel.id.trim();
		}
		apiPath += "&key=" + settings.youTubeApiKey;
		opt = {
			host: "www.googleapis.com",
			path: apiPath,
			headers: {
				Accept:"application/json"
			}
		};
	} catch(err) {
		print(err);
		return;
	}

	https.get(opt, (res) => {
		var body = "";

		res.on("data", (chunk) => {
			body += chunk;
		});

		res.on("end", () => {
			var json;
			try {
				json = JSON.parse(body);
			} catch(err) {
				print(err);
				return;
			}
			if(json.status == 404) {
				callback(server, undefined, undefined);
			} else {
				callback(server, youTubeChannel, json);
			}
		});

	}).on("error", (err) => {
		print(err);
	});
}

function youTubeApiCallback(server, youTubeChannel, res) {
	if(res && res.pageInfo && res.pageInfo.totalResults > 0 && res.items[0].snippet.publishedAt > youTubeChannel.timestamp) {
		try {
			var channels = [], defaultChannel;
			var guild = bot.guilds.find("name", server.name);

			if(server.discordChannels.length === 0) {
				defaultChannel = guild.channels.find("type", "text");
			} else {
				for(let i = 0; i < server.discordChannels.length; i++) {
					channels.push(guild.channels.find("name", server.discordChannels[i]));
				}
			}
			var embed = new Discord.RichEmbed()
				.setColor("#ff0000")
				.setAuthor(res.items[0].snippet.channelTitle)
				.setTitle(res.items[0].snippet.title)
				.setURL("https://www.youtube.com/watch?v=" + res.items[0].contentDetails.upload.videoId)
				.setDescription(res.items[0].snippet.description)
				.setImage(res.items[0].snippet.thumbnails.default.url)
				.setThumbnail(youTubeChannel.icon)
				.setFooter("YouTube","https://www.gstatic.com/youtube/img/branding/favicon/favicon_144x144.png");

			if(channels.length !== 0) {
				for(let i = 0; i < channels.length; i++) {
					channels[i].send(embed).then(
						print("Sent YouTube embed to channel '" + channels[i].name + "' on server '" + server.name + "'."));
				}
				youTubeChannel.timestamp = res.items[0].snippet.publishedAt;
			} else if(defaultChannel) {
				defaultChannel.send(embed).then(
					print("Sent YouTube embed to channel '" + defaultChannel.name + "' on server '" + server.name + "'."));
				youTubeChannel.timestamp = res.items[0].snippet.publishedAt;
			}
		} catch(err) {
			print(err);
		}
	}
}

function getWordPressImage(server, blogSite, featuredMedia, inputRes, callback) {
	var opt;
	try {
		var apiPath = "/wp-json/wp/v2/media/" + featuredMedia;
		opt = {
			host: blogSite.name,
			path: apiPath,
			headers: {
				Accept:"application/json"
			}
		};
	} catch(err) {
		print(err);
		return;
	}
	
	https.get(opt, (res) => {
		var body = "";

		res.on("data", (chunk) => {
			body += chunk;
		});

		res.on("end", () => {
			var json;
			try {
				json = JSON.parse(body);
			} catch(err) {
				print(err);
				return;
			}
			if(json.status == 404) {
				callback(server, blogSite, inputRes, undefined);
			} else {
				callback(server, blogSite, inputRes, json.source_url);
			}
		});

	}).on("error", (err) => {
		print(err);
	});
}

function callWordPressApi(server, blogSite, callback) {
	var opt;
	try {
		var apiPath = "/wp-json/wp/v2/posts?context=embed";
		opt = {
			host: blogSite.name,
			path: apiPath,
			headers: {
				Accept:"application/json"
			}
		};
	} catch(err) {
		print(err);
		return;
	}

	https.get(opt, (res) => {
		var body = "";

		res.on("data", (chunk) => {
			body += chunk;
		});

		res.on("end", () => {
			var json;
			try {
				json = JSON.parse(body);
			} catch(err) {
				print(err);
				return;
			}
			if(json.status == 404) {
				callback(server, undefined, undefined);
			} else {
				callback(server, blogSite, json);
			}
		});

	}).on("error", (err) => {
		print(err);
	});
}

function wordPressApiCallback(server, blogSite, res) {
	if (res && res[0].date > blogSite.timestamp && res[0].type == "post") {
		blogSite.timestamp = res[0].date;
		getWordPressImage(server, blogSite, res[0].featured_media, res, wordPressSendEmbedCallback);
	}
}

function wordPressSendEmbedCallback(server, blogSite, res, imageLoc) {
	try {
		var channels = [], defaultChannel;
		var guild = bot.guilds.find("name", server.name);

		if(server.discordChannels.length === 0) {
			defaultChannel = guild.channels.find("type", "text");
		} else {
			for(let i = 0; i < server.discordChannels.length; i++) {
				channels.push(guild.channels.find("name", server.discordChannels[i]));
			}
		}
		var embed = new Discord.RichEmbed()
			.setColor("#21759b")
			.setTitle(res[0].title.rendered.replace(/&#8211;/g,"-").replace(/&#8216;/g,"'").replace(/&#8217;/g,"'").replace(/&#8220;/g,"\"").replace(/&#8221;/g,"\""))
			.setURL(res[0].link)
			.setDescription(res[0].excerpt.rendered.replace("<p>","").replace("</p>","").replace(/&#8216;/g,"'").replace(/&#8217;/g,"'").replace(/&#8220;/g,"\"").replace(/&#8221;/g,"\""))
			.setImage(imageLoc)
			.setFooter("WordPress","https://s.w.org/about/images/wordpress-logo-notext-bg.png");
		
		if(channels.length !== 0) {
			for(let i = 0; i < channels.length; i++) {
				channels[i].send(embed).then(
					print("Sent WordPress embed to channel '" + channels[i].name + "' on server '" + server.name + "'."));
			}
			blogSite.timestamp = res[0].date;
		} else if(defaultChannel) {
			defaultChannel.send(embed).then(
				print("Sent WordPress embed to channel '" + defaultChannel.name + "' on server '" + server.name + "'."));
			blogSite.timestamp = res[0].date;
		}
	} catch(err) {
		print(err);
	}
}

function callMixerApi(server, mixerChannel, callback) {
	var opt;
	try {
		var apiPath = "/api/v1/channels/" + mixerChannel.name.trim();

		opt = {
			host: "mixer.com",
			path: apiPath,
			headers: {
				Accept: "application/json"
			}
		};
	} catch(err) {
		print(err);
		return;
	}

	https.get(opt, (res) => {
		var body = "";

		res.on("data", (chunk) => {
			body += chunk;
		});

		res.on("end", () => {
			var json;
			try {
				json = JSON.parse(body);
			} catch(err) {
				print(err);
				return;
			}
			if(json.status == 404) {
				callback(server, undefined, undefined);
			} else {
				callback(server, mixerChannel, json);
			}
		});

	}).on("error", (err) => {
		print(err);
	});
}

function mixerApiCallback(server, mixerChannel, res) {
	if (res && !mixerChannel.online && res.online) {
		try {
			var channels = [], defaultChannel;
			var guild = bot.guilds.find("name", server.name);

			if(server.discordChannels.length === 0) {
				defaultChannel = guild.channels.find("type", "text");
			} else {
				for(let i = 0; i < server.discordChannels.length; i++) {
					channels.push(guild.channels.find("name", server.discordChannels[i]));
				}
			}
			var embed = new Discord.RichEmbed()
				.setColor("#1fbaed")
				.setTitle(res.name)
				.setURL("https://mixer.com/" + res.token)
				.setDescription("**" + res.type.parent + "**\n" + res.type.name)
				.setImage(res.type.backgroundUrl)
				.addField("Followers", res.numFollowers, true)
				.addField("Views", res.viewersTotal, true)
				.setFooter("Mixer", "https://raw.githubusercontent.com/mixer/branding-kit/master/png/MixerMerge_Light.png");
			if (res.thumbnail && res.thumbnail.url) {
				embed.setThumbnail(res.thumbnail.url);
			}
			if (res.user.avatarUrl) {
				embed.setAuthor(res.user.username, res.user.avatarUrl, "https://mixer.com/" + res.token);
			} else {
				embed.setAuthor(res.user.username, "", "https://mixer.com/" + res.token);
			}	

			if(channels.length !== 0) {
				for(let i = 0; i < channels.length; i++) {
					channels[i].send(embed).then(
						print("Sent Mixer embed to channel '" + channels[i].name + "' on server '" + server.name + "'."));
				}
				mixerChannel.online = true;
				mixerChannel.timestamp = res.updatedAt;
			} else if(defaultChannel) {
				defaultChannel.send(embed).then(
					print("Sent Mixer embed to channel '" + defaultChannel.name + "' on server '" + server.name + "'."));
				mixerChannel.online = true;
				mixerChannel.timestamp = res.updatedAt;
			}
		} catch(err) {
			print(err);
		}
	} else if (res && !res.online) {
		mixerChannel.online = false;
	}
}

function callFacebookApi(server, facebookPage, callback, getPageInfo) {
	var opt;
	try {
		var apiPath = '';
		if (getPageInfo) {
			apiPath = "/search?q=" + facebookPage.name + "&type=page"; 
		} else {
			apiPath = "/" + facebookPage.id + "?fields=about,cover,description,likes,link,name,picture,posts.limit(2)";
		}
		apiPath += "&access_token=" + settings.facebookClient + "|" + settings.facebookSecret;
		opt = {
			host: "graph.facebook.com",
			path: apiPath,
			headers: {
				Accept:"application/json"
			}
		};
	} catch(err) {
		print(err);
		return;
	}

	https.get(opt, (res) => {
		var body = "";

		res.on("data", (chunk) => {
			body += chunk;
		});

		res.on("end", () => {
			var json;
			try {
				json = JSON.parse(body);
			} catch(err) {
				print(err);
				return;
			}
			if(json.status == 404) {
				callback(server, undefined, undefined);
			} else {
				callback(server, facebookPage, json);
			}
		});

	}).on("error", (err) => {
		print(err);
	});
}

function facebookApiCallback(server, facebookPage, res) {
	if(res && res.posts.data[0].created_time > facebookPage.timestamp && res.posts.data[0].message) {
		try {
			var channels = [], defaultChannel;
			var guild = bot.guilds.find("name", server.name);

			if(server.discordChannels.length === 0) {
				defaultChannel = guild.channels.find("type", "text");
			} else {
				for(let i = 0; i < server.discordChannels.length; i++) {
					channels.push(guild.channels.find("name", server.discordChannels[i]));
				}
			}
			var embed = new Discord.RichEmbed()
				.setColor("#3b5998")
				.setTitle(res.name)
				.setURL(res.link)
				.setDescription(res.posts.data[0].message)
				.setImage(res.cover.source)
				.setThumbnail(res.picture.data.url)
				.setFooter("Facebook", "https://upload.wikimedia.org/wikipedia/commons/thumb/c/c2/F_icon.svg/200px-F_icon.svg.png");

			if(channels.length !== 0) {
				for(let i = 0; i < channels.length; i++) {
					channels[i].send(embed).then(
						print("Sent Facebook embed to channel '" + channels[i].name + "' on server '" + server.name + "'."));
				}
				facebookPage.timestamp = res.posts.data[0].created_time;
			} else if(defaultChannel) {
				defaultChannel.send(embed).then(
					print("Sent Facebook embed to channel '" + defaultChannel.name + "' on server '" + server.name + "'."));
				facebookPage.timestamp = res.posts.data[0].created_time;
			}
		} catch(err) {
			print(err);
		}
	}
}

function sendBirthday(server, userInfo) {
	let d = new Date();
	let month = d.getMonth() + 1;
	let day = d.getDate();
	let year = d.getFullYear();
	try {
		var channels = [], defaultChannel;
		var guild = bot.guilds.find("name", server.name);

		if(server.discordChannels.length === 0) {
			defaultChannel = guild.channels.find("type", "text");
		} else {
			for(let i = 0; i < server.discordChannels.length; i++) {
				channels.push(guild.channels.find("name", server.discordChannels[i]));
			}
		}
		
		var birthdayMessage = "Happy Birthday <@" + userInfo.name + ">!";
		if (userInfo.birthYear > 0) {
			let age = year - userInfo.birthYear;
			birthdayMessage += "\nWow, " + String(age) + " already.";
		}
		
		var embed = new Discord.RichEmbed()
			//.setColor("#3b5998")
			.setTitle("Happy Birthday!")
			//.setURL(res.link)
			.setDescription(birthdayMessage)
			//.setImage(res.cover.source)
			//.setThumbnail(res.picture.data.url)
			//.setFooter("Facebook", "https://upload.wikimedia.org/wikipedia/commons/thumb/c/c2/F_icon.svg/200px-F_icon.svg.png");

		if(channels.length !== 0) {
			for(let i = 0; i < channels.length; i++) {
				channels[i].send(embed).then(
					print("Sent birthday embed to channel '" + channels[i].name + "' on server '" + server.name + "'."));
			}
		} else if(defaultChannel) {
			defaultChannel.send(embed).then(
				print("Sent birthday embed to channel '" + defaultChannel.name + "' on server '" + server.name + "'."));
		}
	} catch(err) {
		print(err);
	}
}

function tick() {
	print("Start Tick");
	var d = new Date();
	let month = d.getMonth() + 1;
	let day = d.getDate();
	let hour = d.getHours() + 1;
	let sendBirthdays = false;
	//print("Checking if send");
	if (hour < 12) {
		sentBirthdays = false;
		sendBirthdays = false;
	} else if (sentBirthdays == false) {
		sentBirthdays = true;
		sendBirthdays = true;
	} else {
		sendBirthdays = false;
	}
	//print("Enter Tick Loop");
	for(let i = 0; i < servers.length; i++) {
		for(let k = -1; k < servers[i].discordChannels.length; k++) {
			for(let j = 0; j < servers[i].twitchChannels.length; j++) {
				if(servers[i].twitchChannels[j]) {
					callTwitchApi(servers[i], servers[i].twitchChannels[j], twitchApiCallback, true);
				}
			}
			for(let j = 0; j < servers[i].twitterFeeds.length; j++) {
				if(servers[i].twitterFeeds[j]) {
					callTwitterApi(servers[i], servers[i].twitterFeeds[j], twitterApiCallback);
				}
			}
			for(let j = 0; j < servers[i].youTubeChannels.length; j++) {
				if(servers[i].youTubeChannels[j]) {
					callYouTubeApi(servers[i], servers[i].youTubeChannels[j], youTubeApiCallback, false);
				}
			}
			for(let j = 0; j < servers[i].blogSites.length; j++) {
				if(servers[i].blogSites[j]) {
					callWordPressApi(servers[i], servers[i].blogSites[j], wordPressApiCallback);
				}
			}
			for(let j = 0; j < servers[i].mixerChannels.length; j++) {
				if(servers[i].mixerChannels[j]) {
					callMixerApi(servers[i], servers[i].mixerChannels[j], mixerApiCallback);
				}
			}
			for(let j = 0; j < servers[i].facebookPages.length; j++) {
				if(servers[i].facebookPages[j]) {
					callFacebookApi(servers[i], servers[i].facebookPages[j], facebookApiCallback, false);
				}
			}
		}
		//print("Start Birthday");
		if (sendBirthdays) {
			//print("Enter For Loop");
			for(let j = 0; j < servers[i].userInfos.length; j++) {
				//print("Check Birthday");
				if (servers[i].userInfos[j] && servers[i].userInfos[j].birthMonth == month && servers[i].userInfos[j].birthDay == day) {
					//print("Send Birthday Function");
					sendBirthday(servers[i], servers[i].userInfos[j]);
				}
			}
		}
	}
	//print("End Tick");
}

bot.on("messageDelete", (message) => {
	var server;
	if(!message.guild){
		return;
	} else if(message.author.bot) {
		return;
	} else {
		let index = indexOfObjectByName(servers, message.guild.name);
		if(index == -1) {
			return;
		}
		server = servers[index];
		if(server.logChannel == ""){
			return;
		} else {
			var guild = bot.guilds.find("name", server.name);
			var channel = guild.channels.find("name", server.logChannel);
			var embed = new Discord.RichEmbed()
				.setColor("#C70000")
				.setTitle("Message Deleted");
			if(message.channel.name) {
				embed.addField("Channel", message.channel.name, false); }
			if(message.author.tag) {
				embed.addField("Author", message.author.tag, false); }
			if(message.cleanContent) {
				embed.addField("Message", message.cleanContent, false); }
			channel.send(embed);
		}
	}
});

bot.on("guildMemberRemove", (member) => {
	var server;
	let index = indexOfObjectByName(servers, member.guild.name);
	if(index == -1) {
		return;
	}
	server = servers[index];
	if(server.leavingChannel == ""){
		return;
	} else {
		var guild = bot.guilds.find("name", server.name);
		var channel = guild.channels.find("name", server.leavingChannel);
		var embed = new Discord.RichEmbed()
			.setColor("#C70000")
			.setTitle("Member Left")
			.addField("Member", member.displayName, false)
			.addField("Tag", member.user.tag, false);
		channel.send(embed);
	}
});

bot.on("messageUpdate", (oldMessage, newMessage) => {
	var server;
	if(!oldMessage.guild){
		return;
	} else if(oldMessage.author.bot) {
		return;
	} else {
		let index = indexOfObjectByName(servers, oldMessage.guild.name);
		if(index == -1) {
			return;
		}
		server = servers[index];
		if(server.logChannel == "" || oldMessage.cleanContent == newMessage.cleanContent){
			return;
		} else {
			var guild = bot.guilds.find("name", server.name);
			var channel = guild.channels.find("name", server.logChannel);
			var embed = new Discord.RichEmbed()
				.setColor("#C70000");
			if(newMessage.author.tag) {
				embed.setTitle("Message Edited By: " + newMessage.author.tag);
			} else {
				embed.setTitle("Message Edited"); }
			if(newMessage.channel.name) {
				embed.addField("Channel", newMessage.channel.name, false); }
			if(oldMessage.cleanContent) {
				embed.addField("Old Message", oldMessage.cleanContent, false); }
			if(newMessage.cleanContent) {
				embed.addField("New Message", newMessage.cleanContent, false); }
			channel.send(embed);
		}
	}
});

bot.on("message", (message) => {
	var server, twitchChannels, twitterFeeds, youTubeChannels, blogSites, customLinks, mixerChannels, bannedWords, facebookPages, userInfos;
	if(!message.guild) {
		return;
	} else if (message.author.bot) {
		return;
	} else {
		let index = indexOfObjectByName(servers, message.guild.name);
		if(index == -1) {
			servers.push({
				name: message.guild.name,
				lastPrefix: "!", prefix: "/",
				role: "botadmin", discordChannels: [],
				twitchChannels: [], twitterFeeds: [], 
				youTubeChannels: [], blogSites: [], 
				customLinks: [], mixerChannels: [], 
				bannedWords: [], facebookPages: [], 
				userInfos: [], logChannel: "", 
				leavingChannel: ""
			});
			index = servers.length - 1;
		}

		server =  servers[index];
		twitchChannels = servers[index].twitchChannels;
		twitterFeeds = servers[index].twitterFeeds;
		youTubeChannels = servers[index].youTubeChannels;
		blogSites = servers[index].blogSites;
		customLinks = servers[index].customLinks;
		mixerChannels = servers[index].mixerChannels;
		bannedWords = servers[index].bannedWords;
		facebookPages = servers[index].facebookPages;
		userInfos = servers[index].userInfos;
	}
	
	if(!message.member.hasPermission("MANAGE_GUILD",false,true,true)) {
		if(message.channel.permissionsFor(bot.user).hasPermission("MANAGE_MESSAGES",false)) {
			let messageWords = message.content.split(" ");
			for(let a = 0; a < messageWords.length; a++) {
				for(let b = 0; b < bannedWords.length; b++) {
					if(messageWords[a].replace(".","").replace("!","").replace(",","").replace("?","").trim() == bannedWords[b].trim()) {
						message.reply("your message was deleted for containing a banned word.");
						message.delete();
						print("Deleted message from " + message.author + " in server " + message.guild.name + " containing the word " + bannedWords[b] + "\nMessage: " + message.content);
					}
				}
			}
		}
	}

	if(message.content[0] == server.prefix) {
		var permission;
		try {
			permission = message.member.roles.exists("name", server.role);
		} catch(err) {
			print(server.role + " is not a role on the server", err);
		}

		let index;
		var streamer;
		var site;
		var channel;
		var tweeter;
		var page;
		
		var comSplit = message.content.split(" ");
		var comm = comSplit[0].replace(server.prefix, "");
		
		switch(comm) {
			case "roll":
				let numDice = message.content.slice(6).trim();
				let replyMsg = "";
				if (numDice == undefined || numDice == "") {
					let diceRoll = Math.floor((Math.random() * 6) + 1);
					let diceEmote = diceRoll + "die";
					diceEmote = bot.emojis.find("name", diceEmote);
					replyMsg += diceEmote.toString();
				} 
				else {
					var numRolls = parseInt(numDice);
					//for (let a = 0; a < numRolls && a < 50; a++) {
					for (let a = 0; a < numRolls; a++) {
						let diceRoll = Math.floor((Math.random() * 6) + 1);
						let diceEmote = diceRoll + "die";
						diceEmote = bot.emojis.find("name", diceEmote);
						replyMsg += diceEmote.toString();
					}
				}
				message.reply(replyMsg);
				break;
			case "info":
				var discordTag = message.author.id;
				if (message.content.substring(6,9) == "set") {
					var userInfo;
					index = indexOfObjectByName(userInfos, discordTag);
					if (index != -1) {
						userInfo = userInfos[index];
					} 
					else {
						userInfo = {name: discordTag, tag: "", link: "", birthMonth: -1, birthDay: -1, birthYear: -1};
					}
					
					if (message.content.substring(10,13) == "tag") {
						let tag = message.content.slice(14).trim();
						if (tag == "") {
							message.reply("please supply a tag to set.");
							return;
						} 
						else {
							userInfo.tag = tag;
							message.reply("Successfully set tag.");
						}
					} 
					else if (message.content.substring(10,14) == "link") {
						let link = message.content.slice(15).trim();
						if (link == "") {
							message.reply("please supply a link to set.");
							return;
						} 
						else {
							userInfo.link = link;
							message.reply("Successfully set link.");
						}
					} 
					else if (message.content.substring(10,18) == "birthday") {
						let birthday = message.content.slice(19).trim();
						let birthdaySplit = birthday.split("/");
						if (birthday == "" || birthdaySplit.length < 2) {
							message.reply("please supply a birthday in `MM/DD/YYYY` format (year is optional).");
							return;
						} 
						else {
							let birthdaySplit = birthday.split("/");
							let birthMonth = parseInt(birthdaySplit[0]);
							let birthDay = parseInt(birthdaySplit[1]);
							userInfo.birthMonth = birthMonth;
							userInfo.birthDay = birthDay;
							if (birthdaySplit.length == 3) {
								let birthYear = parseInt(birthdaySplit[2]);
								userInfo.birthYear = birthYear;
							}
							message.reply("Successfully set birthday.");
						}
					}
					
					if (index == -1) {
						userInfos.push(userInfo);
					}
					
					//message.reply("Successfully set " + message.content.substring(10,14).trim() + " for " + discordTag + ".");
				} 
				else if (message.content.substring(6,9) == "get") {
					var tag = "";
					if (message.mentions.users.array().length > 0) {
						let calledUser = message.mentions.users.first();
						//tag = calledUser.username + "#" + calledUser.discriminator;
						tag = calledUser.id;
					} 
					else {
						//tag = message.content.slice(10).trim().replace("@","");
					}
					if (tag == undefined || tag == "") {
						tag = discordTag;
					}
					index = indexOfObjectByName(userInfos, tag);
					if (index == -1) {
						message.reply("That user doesn't have info set.");
					} 
					else {
						userInfo = userInfos[index];
						let msg = "\nTag: " + userInfo.tag + "\nLink: " + userInfo.link;
						if (userInfo.birthMonth != -1) {
							msg += "\nBirthday: " + String(userInfo.birthMonth) + "/" + String(userInfo.birthDay);
							if (userInfo.birthYear != -1) {
								msg += "/" + String(userInfo.birthYear);
							}
						}
						message.reply(msg);
					}
				} 
				else if (message.content.substring(6,12) == "remove") {
					var tag = "";
					if (message.mentions.users.array().length > 0) {
						let calledUser = message.mentions.users.first();
						//tag = calledUser.username + "#" + calledUser.discriminator;
						tag = calledUser.id;
					} 
					else {
						tag = message.content.slice(13).trim();
					}
					if (tag == undefined || tag == "") {
						tag = discordTag;
					}
					/*let tag = message.content.slice(13).trim().replace("@","");
					if (tag == "") {
						tag = discordTag;
					}*/
					if (tag != discordTag && !permission) {
						message.reply("you're lacking the role _" + server.role + "_.");
						return;
					}
					index = indexOfObjectByName(userInfos, tag);
					if (index == -1) {
						message.reply("That user, " + tag + ", doesn't have info set.");
					} 
					else {
						userInfos.splice(index, 1);
						index = indexOfObjectByName(userInfos, tag);
						if (index == -1) {
							message.reply("Removed user info for " + tag + ".");
						} 
						else {
							message.reply("That user doesn't have info set.");
						}
					}
				} 
				else if (message.content.substring(6,10) == "list") {
					if (userInfos.length == 0) {
						msg = "The list is empty.";
					} 
					else {
						msg = "\nUser Info List:";
						for(let u = 0; u < userInfos.length; u++) {
							userInfo = userInfos[u];
							msg += "\n\nID: " + userInfo.name + "\nTag: " + userInfo.tag + "\nLink: " + userInfo.link;
							if (userInfo.birthMonth != -1) {
								msg += "\nBirthday: " + String(userInfo.birthMonth) + "/" + String(userInfo.birthDay);
								if (userInfo.birthYear != -1) {
									msg += "/" + String(userInfo.birthYear);
								}
							}
						}
					}
					message.reply(msg);
				}
				break;
			case "link":
				if(message.content.substring(6,12) == "remove") {
					if(permission) {
						linkCommand = message.content.slice(13).trim();
						index = indexOfObjectByName(customLinks, linkCommand);
						if(index != -1) {
							customLinks.splice(index, 1);
							index = indexOfObjectByName(customLinks, linkCommand);
							if(index == -1) {
								message.reply("Removed " + linkCommand + ".");
							} 
							else {
								message.reply(linkCommand + " isn't in the list.");
							}
						} 
						else {
							message.reply(linkCommand + " isn't in the list.");
						}
					} 
					else {
						message.reply("you're lacking the role _" + server.role + "_.");
					}
				} 
				else if(message.content.substring(6,9) == "add") {
					if(permission) {
						resultSplit = message.content.slice(9).trim().split(" ");
						linkCommand = resultSplit[0];
						linkLink = resultSplit[1];
						index = indexOfObjectByName(customLinks, linkCommand);
						if(index == -1) {
							customLinks.push({name: linkCommand, link: linkLink});
							message.reply("Added " + linkCommand + ".");
						} 
						else {
							message.reply(linkCommand + " is already in the list.");
						}
					} 
					else {
						message.reply("you're lacking the role _" + server.role + "_.");
					}
				} 
				else if (message.content.substring(6,12) == "update") {
					if(permission) {
						resultSplit = message.content.slice(12).trim().split(" ");
						linkCommand = resultSplit[0];
						linkLink = resultSplit[1];
						index = indexOfObjectByName(customLinks, linkCommand);
						if(index == -1) {
							message.reply(linkCommand + " isn't in the list.");
						} 
						else {
							customLinks.splice(index, 1);
							customLinks.push({name: linkCommand, link: linkLink});
							message.reply("Updated " + linkCommand + ".");
						}
					} 
					else {
						message.reply("you're lacking the role _" + server.role + "_.");
					}
				} 
				else if(message.content.substring(6,10) == "list") {
					var mesg = "";
					for (let h = 0; h < customLinks.length; h++) {
						mesg += "\n" + customLinks[h].name + " `" + customLinks[h].link + "`";
					}
					if(mesg == "") {
						message.reply("The list is empty.");
					} 
					else {
						message.reply(mesg);
					}
				}
				break;
			case "blog":
				if(message.content.substring(6, 12) == "remove"){
					if(permission){
						site = message.content.slice(13).trim();
						index = indexOfObjectByName(blogSites, site);
						if(index != -1){
							blogSites.splice(index, 1);
							index = indexOfObjectByName(blogSites, site);
							if(index == -1){
								message.reply("Removed " + site + ".");
							}
							else{
								message.reply(site + " isn't in the list.");
							}
						}
						else{
							message.reply(site + " isn't in the list.");
						}
					}
					else{
						message.reply("you're lacking the role _" + server.role + "_.");
					}
				}
				else if(message.content.substring(6, 9) == "add"){
					if(permission){
						site = message.content.slice(10).trim();
						var blogSite = {name: site};
						index = indexOfObjectByName(blogSites, site);
						callWordPressApi(server, blogSite, (serv, chan, res)=>{
							if(index != -1){
								message.reply(site + " is already in the list.");
							}
							else if(res){
								blogSites.push({name: site, timestamp: "2011-09-30T01:14:51.000Z"});
								message.reply("Added " + site + ".");
								tick();
							}
							else{
								message.reply(site + " doesn't seem to exist.");
							}
						}, false);
					}
					else{
						message.reply("you're lacking the role _" + server.role + "_.");
					}
				}
				else if(message.content.substring(6, 10) == "list"){
					var msag = "";
					for (let w = 0; w < blogSites.length; w++){
						msag += "\n" + blogSites[w].name;
					}
					if(msag == ""){
						message.reply("The list is empty.");
					}
					else{
						message.reply(msag);
					}
				}
				break;
			case "mixer":
				if(message.content.substring(7, 13) == "remove"){
					if(permission){
						streamer = message.content.slice(14).trim();
						index = indexOfObjectByName(mixerChannels, streamer);
						if(index != -1){
							mixerChannels.splice(index, 1);
							index = indexOfObjectByName(mixerChannels, streamer);
							if(index == -1){
								message.reply("Removed " + streamer + ".");
							}
							else{
								message.reply(streamer + " isn't in the list.");
							}
						}
						else{
							message.reply(streamer + " isn't in the list.");
						}
					}
					else{
						message.reply("you're lacking the role _" + server.role + "_.");
					}

				}
				else if(message.content.substring(7, 10) == "add"){
					if(permission){
						streamer = message.content.slice(11).trim();
						var channelObject = {name: streamer};
						index = indexOfObjectByName(mixerChannels, streamer);
						callMixerApi(server, channelObject, (serv, chan, res)=>{
							if(index != -1){
								message.reply(streamer + " is already in the list.");
							}
							else if(res){
								mixerChannels.push({name: streamer, timestamp: "2011-09-30T01:14:51.000Z",
													 online: false});
								message.reply("Added " + streamer + ".");
								tick();
							}
							else{
								message.reply(streamer + " doesn't seem to exist.");
							}
						}, false);
					}
					else{
						message.reply("you're lacking the role _" + server.role + "_.");
					}

				}
				else if(message.content.substring(7, 11) == "list"){
					let msg = "\n";
					for(let i = 0; i < mixerChannels.length; i++){
						var streamStatus;
						if(mixerChannels[i].online){
							msg += "**" + mixerChannels[i].name + " online**\n";
						}
						else{
							streamStatus = "offline";
							msg += mixerChannels[i].name + " offline\n";
						}
					}
					if(msg == "\n"){
						message.reply("The list is empty.");
					}
					else{
						message.reply(msg.replace(/_/g, "\\_"));
					}

				}
				break;
			case "twitch":
				if(message.content.substring(8, 14) == "remove"){
					if(permission){
						streamer = message.content.slice(15).trim();
						index = indexOfObjectByName(twitchChannels, streamer);
						if(index != -1){
							twitchChannels.splice(index, 1);
							index = indexOfObjectByName(twitchChannels, streamer);
							if(index == -1){
								message.reply("Removed " + streamer + ".");
							}
							else{
								message.reply(streamer + " isn't in the list.");
							}
						}
						else{
							message.reply(streamer + " isn't in the list.");
						}
					}
					else{
						message.reply("you're lacking the role _" + server.role + "_.");
					}

				}
				else if(message.content.substring(8, 11) == "add"){
					if(permission){
						streamer = message.content.slice(12).trim();
						var channelObject = {name: streamer};
						index = indexOfObjectByName(twitchChannels, streamer);
						callTwitchApi(server, channelObject, (serv, chan, res)=>{
							if(index != -1){
								message.reply(streamer + " is already in the list.");
							}
							else if(res && res.data[0].id){
								twitchChannels.push({name: streamer, id: res.data[0].id, timestamp: "2011-09-30T01:14:51.000Z",
													 online: false});
								message.reply("Added " + streamer + ".");
								tick();
							}
							else{
								message.reply(streamer + " doesn't seem to exist.");
							}
						}, false);
					}
					else{
						message.reply("you're lacking the role _" + server.role + "_.");
					}

				}
				else if(message.content.substring(8, 12) == "list"){
					let msg = "\n";
					for(let i = 0; i < twitchChannels.length; i++){
						var streamStatus;
						if(twitchChannels[i].online){
							msg += "**" + twitchChannels[i].name + " online**\n";
						}
						else{
							streamStatus = "offline";
							msg += twitchChannels[i].name + " offline\n";
						}
					}
					if(msg == "\n"){
						message.reply("The list is empty.");
					}
					else{
						message.reply(msg.replace(/_/g, "\\_"));
					}

				}
				break;
			case "twitter":
				if(message.content.substring(9, 15) == "remove"){
					if(permission){
						tweeter = message.content.slice(16).trim();
						index = indexOfObjectByName(twitterFeeds, tweeter);
						if(index != -1){
							twitterFeeds.splice(index, 1);
							index = indexOfObjectByName(twitterFeeds, tweeter);
							if(index == -1){
								message.reply("Removed " + tweeter + ".");
							}
							else{
								message.reply(tweeter + " isn't in the list.");
							}
						}
						else{
							message.reply(tweeter + " isn't in the list.");
						}
					}
					else{
						message.reply("you're lacking the role _" + server.role + "_.");
					}

				}
				else if(message.content.substring(9, 12) == "add"){
					if(permission){
						tweeter = message.content.slice(13).trim();
						var twitterObject = {name: tweeter};
						index = indexOfObjectByName(twitterFeeds, tweeter);
						callTwitterApi(server, twitterObject, (serv, chan, res)=>{
							if(index != -1){
								message.reply(tweeter + " is already in the list.");
							}
							else if(res){
								twitterFeeds.push({name: tweeter, timestamp: new Date(-8640000000000000)});
								message.reply("Added " + tweeter + ".");
								tick();
							}
							else{
								message.reply(tweeter + " doesn't seem to exist.");
							}
						});
					}
					else{
						message.reply("you're lacking the role _" + server.role + "_.");
					}

				}
				else if(message.content.substring(9, 13) == "list"){
					let msg = "\n";
					for(let i = 0; i < twitterFeeds.length; i++){
						msg += twitterFeeds[i].name + "\n";
					}
					if(msg == "\n"){
						message.reply("The list is empty.");
					}
					else{
						message.reply(msg.replace(/_/g, "\\_"));
					}

				}
				break;
			case "youtube":
				if(message.content.substring(9, 15) == "remove"){
					if(permission){
						channel = message.content.slice(15).trim();
						index = indexOfObjectByName(youTubeChannels, channel);
						if(index != -1){
							youTubeChannels.splice(index, 1);
							index = indexOfObjectByName(youTubeChannels, channel);
							if(index == -1){
								message.reply("Removed " + channel + ".");
							}
							else{
								message.reply(channel + " isn't in the list.");
							}
						}
						else{
							message.reply(channel + " isn't in the list.");
						}
					}
					else{
						message.reply("you're lacking the role _" + server.role + "_.");
					}

				}
				else if(message.content.substring(9, 12) == "add"){
					if(permission){
						channel = message.content.slice(12).trim();
						var channelObject = {name: channel};
						index = indexOfObjectByName(youTubeChannels, channel);
						callYouTubeApi(server, channelObject, (serv, chan, res)=>{
							if(index != -1){
								message.reply(channel + " is already in the list.");
							}
							else if(res && res.pageInfo){
								if(res.pageInfo.totalResults == 0){
									message.reply(channel + " doesn't seem to exist.");
								}
								else{
									youTubeChannels.push({name: channel, id: res.items[0].id, icon: res.items[0].snippet.thumbnails.high.url, timestamp: "2011-09-30T01:14:51.000Z"});
									message.reply("Added " + channel + ".");
									tick();
								}
							}
							else{
								message.reply(channel + " doesn't seem to exist.");
							}
						}, true);
					}
					else{
						message.reply("you're lacking the role _" + server.role + "_.");
					}

				}
				else if(message.content.substring(9, 13) == "list"){
					let msg = "\n";
					for(let i = 0; i < youTubeChannels.length; i++){
						msg += youTubeChannels[i].name + "\n";
					}
					if(msg == "\n"){
						message.reply("The list is empty.");
					}
					else{
						message.reply(msg.replace(/_/g, "\\_"));
					}

				}
				break;
			case "about":
				var embed = new Discord.RichEmbed()
					.setColor('GOLD')
					.setTitle(bot.user.tag)
					.setAuthor("KSI Discord Bot")
					.setURL("https://discordapp.com/oauth2/authorize?client_id=" + bot.user.id + "&scope=bot")
					.setDescription("A custom made bot to help push social media updates and allows custom, easy-access links to be created.")
					.setThumbnail(bot.user.displayAvatarURL)
					.setImage("http://www.ksiglobal.org/wp-content/uploads/2014/06/ksibannerimage2-300x107.png")
					.setFooter("Created with love by Kalakoi.")
					.addField("KSI", "Knowledge, Strength, Integrity", false)
					.addField("Servers", bot.guilds.array().length, false);
				message.channel.send(embed);
				break;
			case "configure":
				let msg = "";
				if (message.member.hasPermission("MANAGE_GUILD",false,true,true)) {
					if(message.content.substring(11, 15) == "list"){
						msg += "```\n" +
							   "prefix    " + server.prefix + "\n" +
							   "role      " + server.role + "\n";

						msg += "channels  " + server.discordChannels[0];
						if(server.discordChannels.length > 1){
							msg += ",";
						}
						msg += "\n";

						for(let i = 1; i < server.discordChannels.length; i++){
							msg += "          " + server.discordChannels[i];
							if(i != server.discordChannels.length -1){
								msg += ",";
							}
							msg += "\n";
						}
						
						msg += "banlist  " + server.bannedWords[0];
						if(server.bannedWords.length > 1){
							msg += ",";
						}
						msg += "\n";
						for(let i = 1; i < server.bannedWords.length; i++){
							msg += "          " + server.bannedWords[i];
							if(i != server.bannedWords.length - 1){
								msg += ",";
							}
							msg += "\n";
						}
						
						msg += "```";

					}
					else if(message.content.substring(11, 17) == "prefix"){
						let newPrefix = message.content.substring(18, 19);
						if(newPrefix.replace(/\s/g, '').length === 0){
							msg += "Please specify an argument";
						}
						else if(newPrefix == server.prefix){
							msg += "Prefix already is " + server.prefix;
						}
						else{
							server.lastPrefix = server.prefix;
							server.prefix = newPrefix;
							msg += "Changed prefix to " + server.prefix;
						}

					}
					else if(message.content.substring(11, 15) == "role"){
						if(message.content.substring(16).replace(/\s/g, '').length === 0){
							msg += "Please specify an argument";
						}
						else{
							server.role = message.content.substring(16);
							msg += "Changed role to " + server.role;
						}

					}
					else if(message.content.substring(11, 18) == "channel"){
						if(message.content.substring(19, 22) == "add"){
							let channel = message.content.substring(23);
							if(channel.replace(/\s/g, '').length === 0){
								msg += "Please specify an argument";
							}
							else if(message.guild.channels.exists("name", channel)){
								server.discordChannels.push(channel);
								msg += "Added " + channel + " to list of channels to post in.";
							}
							else{
								msg += channel + " does not exist on this server.";
							}

						}
						else if(message.content.substring(19, 25) == "remove"){
							for(let i = server.discordChannels.length; i >= 0; i--){
								let channel = message.content.substring(26);
								if(channel.replace(/\s/g, '').length === 0){
									msg = "Please specify an argument";
									break;
								}
								else if(server.discordChannels[i] == channel){
									server.discordChannels.splice(i, 1);
									msg = "Removed " + channel + " from list of channels to post in.";
									break;
								}
								else{
									msg = channel + " does not exist in list.";
								}
							}
						}
						else{
							msg = "Please specify an argument for channel";
						}

					} 
					else if(message.content.substring(11,14) == "log") {
						let channel = message.content.substring(15);
						if(channel.replace(/\s/g, '').length === 0){
							msg += "Please specify a channel name";
						}
						else if(message.guild.channels.exists("name", channel)){
							server.logChannel = channel;
							msg += "Set " + channel + " as the log channel.";
						}
						else{
							msg += channel + " is not a channel on this server.";
						}
					} 
					else if (message.content.substring(11,18) == "leaving"){
						let channel = message.content.substring(19);
						if(channel.replace(/\s/g, '').length === 0){
							msg += "Please specify a channel name";
						}
						else if(message.guild.channels.exists("name", channel)){
							server.leavingChannel = channel;
							msg += "Set " + channel + " as the log channel.";
						}
						else{
							msg += channel + " is not a channel on this server.";
						}
					} 
					else if(message.content.substring(11,18) == "banlist"){
						if(message.content.substring(19, 22) == "add"){
							let word = message.content.substring(23);
							server.bannedWords.push(word);
							msg += "Added " + word + " to the list of banned words.";
						}
						else if(message.content.substring(19, 25) == "remove"){
							let word = message.content.substring(26);
							for(let i = server.bannedWords.length; i >= 0; i--){
								if(server.bannedWords[i] == word){
									server.bannedWords.splice(i, 1);
									msg = "Removed " + word + " from the list of banned words.";
									break;
								} 
								else {
									msg = word + " does not exist in the banned words list.";
								}
							}
						}
						else{
							msg = "Please specify an argument for banlist";
						}
					}
					else{
						msg += "```\n" +
							   "Usage: " + server.prefix + "configure OPTION [SUBOPTION] VALUE\n" +
							   "Example: " + server.prefix + "configure channel add example\n" +
							   "\nOptions:\n" +
							   "  list        List current config\n" +
							   "  prefix      Character to use in front of commands\n" +
							   "  role        Role permitting usage of add and remove\n" +
							   "  channel     Channel(s) to post in, empty list will use the first channel\n" +
							   "      add         Add a discord channel to the list\n" +
							   "      remove      Remove a discord channel from the list\n" +
							   "  banlist     Word(s) banned on the server, will be immediately deleted\n" +
							   "      add         Add a word to the banned word list\n" +
							   "      remove      Remove a word from the banned word list\n" +
							   "```";
					}
				}
				else{
					msg += "You are not the server owner.";
				}
				message.reply(msg);
				break;
			case "facebook":
				if(message.content.substring(10, 16) == "remove"){
					if(permission){
						page = message.content.slice(17).trim();
						index = indexOfObjectByName(facebookPages, page);
						if(index != -1){
							facebookPages.splice(index, 1);
							index = indexOfObjectByName(facebookPages, page);
							if(index == -1){
								message.reply("Removed " + page + ".");
							}
							else{
								message.reply(page + " isn't in the list.");
							}
						}
						else{
							message.reply(page + " isn't in the list.");
						}
					}
					else{
						message.reply("you're lacking the role _" + server.role + "_.");
					}

				}
				else if(message.content.substring(10, 13) == "add"){
					if(permission){
						page = message.content.slice(13).trim();
						var facebookObject = {name: page};
						index = indexOfObjectByName(facebookPages, page);
						callFacebookApi(server, facebookObject, (serv, chan, res)=>{
							if(index != -1){
								message.reply(page + " is already in the list.");
							}
							else if(res){
								if(res.data.length == 0){
									message.reply(page + " doesn't seem to exist.");
								}
								else{
									facebookPages.push({name: page, id: res.data[0].id, timestamp: "2011-09-30T01:14:51.000Z"});
									message.reply("Added " + page + ".");
									tick();
								}
							}
							else{
								message.reply(page + " doesn't seem to exist.");
							}
						}, true);
					}
					else{
						message.reply("you're lacking the role _" + server.role + "_.");
					}

				}
				else if(message.content.substring(10, 14) == "list"){
					let msg = "\n";
					for(let i = 0; i < facebookPages.length; i++){
						msg += facebookPages[i].name + "\n";
					}
					if(msg == "\n"){
						message.reply("The list is empty.");
					}
					else{
						message.reply(msg.replace(/_/g, "\\_"));
					}
				}
				break;
			case "ping":
				message.reply('Pong!');
				break;
			case "help":
				if (message.content.substring(6,15) == "configure") {
					msg = "\n```\n" +
						   "Usage: " + server.prefix + "configure OPTION [SUBOPTION] VALUE\n" +
						   "Example: " + server.prefix + "configure channel add example\n" +
						   "\nOptions:\n" +
						   "  list        List current configuration\n" +
						   "  prefix      Character to use in front of commands\n" +
						   "  role        Role permitting usage of add and remove options on commands\n" +
						   "  channel     Channel(s) to post in, empty list will use the first text channel\n" +
						   "      add         Add a discord channel to post in\n" +
						   "      remove      Remove a discord channel from the list\n" +
						   "  banlist     Word(s) banned on the server, will be immediately deleted\n" +
						   "      add         Add a word to the banned word list\n" +
						   "      remove      Remove a word from the banned word list\n" +
						   "```";
				} 
				else if (message.content.substring(6,12) == "twitch") {
					msg = "\n```\n" +
						   "Usage: " + server.prefix + "twitch OPTION [VALUE]\n" +
						   "Example: " + server.prefix + "twitch add example\n" +
						   "\nOptions:\n" +
						   "  add         Add a Twitch channel to watch\n" +
						   "  remove      Remove a Twitch channel from the list\n" +
						   "  list        List all Twitch channels being watched\n" +
						   "```";
				} 
				else if (message.content.substring(6,11) == "mixer") {
					msg = "\n```\n" +
						   "Usage: " + server.prefix + "mixer OPTION [VALUE]\n" +
						   "Example: " + server.prefix + "mixer add example\n" +
						   "\nOptions:\n" +
						   "  add         Add a Mixer channel to watch\n" +
						   "  remove      Remove a Mixer channel from the list\n" +
						   "  list        List all Mixer channels being watched\n" +
						   "```";
				} 
				else if (message.content.substring(6,13) == "twitter") {
					msg = "\n```\n" +
						   "Usage: " + server.prefix + "twitter OPTION [VALUE]\n" +
						   "Example: " + server.prefix + "twitter add example\n" +
						   "\nOptions:\n" +
						   "  add         Add a Twitter feed to watch\n" +
						   "  remove      Remove a Twitter feed from the list\n" +
						   "  list        List all Twitter feeds being watched\n" +
						   "```";
				} 
				else if (message.content.substring(6,13) == "youtube") {
					msg = "\n```\n" +
						   "Usage: " + server.prefix + "youtube OPTION [VALUE]\n" +
						   "Example: " + server.prefix + "youtube add example\n" +
						   "\nOptions:\n" +
						   "  add         Add a YouTube channel to watch\n" +
						   "  remove      Remove a YouTube channel from the list\n" +
						   "  list        List all YouTube channels being watched\n" +
						   "```";
				} 
				else if (message.content.substring(6,10) == "blog") {
					msg = "\n```\n" +
						   "Usage: " + server.prefix + "blog OPTION [VALUE]\n" +
						   "Example: " + server.prefix + "blog add www.ksiglobal.org\n" +
						   "\nOptions:\n" +
						   "  add         Add a WordPress blog to watch\n" +
						   "  remove      Remove a WordPress blog from the list\n" +
						   "  list        List all WordPress blogs being watched\n" +
						   "```";
				} 
				else if (message.content.substring(6,10) == "link") {
					msg = "\n```\n" +
						   "Usage: " + server.prefix + "link OPTION [VALUE]\n" +
						   "Example: " + server.prefix + "link add https://google.com\n" +
						   "\nOptions:\n" +
						   "  add         Add a quick link to the command list\n" +
						   "  remove      Remove a quick link from the list\n" +
						   "  list        List all quick links in the command list\n" +
						   "  update      Updates a command to a new link\n" +
						   "```";
				} 
				else if (message.content.substring(6,14) == "facebook") {
					msg = "\n```\n" +
						   "NOT YET IMPLEMENTED\n\n" +
						   "Usage: " + server.prefix + "facebook OPTION [VALUE]\n" +
						   "Example: " + server.prefix + "facebook add example\n" +
						   "\nOptions:\n" +
						   "  add         Add a Facebook page to watch\n" +
						   "  remove      Remove a Facebook page from the list\n" +
						   "  list        List all Facebook page being watched\n" +
						   "```";
				} 
				else {
					msg = "\n```\n" +
						   "Available Commands:\n\n" +
						   "  help      [OPTION]        \n" +
						   "  about                   \n" +
						   "  twitch    OPTION [VALUE]\n" +
						   "  mixer     OPTION [VALUE]\n" +
						   "  twitter   OPTION [VALUE]\n" +
						   "  youtube   OPTION [VALUE]\n" +
						   "  link      OPTION [VALUE]\n" +
						   "  blog      OPTION [VALUE]\n" +
						   "  facebook  (Not Yet Implemented)\n" +
						   "  configure OPTION [SUBOPTION] VALUE\n" +
						   "\nFor more information on a specific command type:\n" +
						   server.prefix + "help [COMMAND]\n Example:\n" +
						   server.prefix + "help twitch\n" +
						   "```\n```" +
						   "Custom Commands:\n\n";
					for (let l = 0; l < customLinks.length; l++) {
						msg += "  " + customLinks[l].name;
						for (let w = 0; w < 15 - customLinks[l].name.length; w++) {
							msg += " ";
						}
						//msg += customLinks[l].link;
						msg += "\n";
					}
					msg += "```";
				}
				message.reply(msg);
				break;
			default:
				linkTestCommand = message.content.slice(1).trim();
				var commandFound = false;
				for(let l = 0; l < customLinks.length; l++){
					if(linkTestCommand == customLinks[l].name){
						commandFound = true;
						message.reply(customLinks[l].link);
					}
				}
		}
    }
	else if(message.content[0] == server.lastPrefix){
        message.reply("The prefix was changed from `" + server.lastPrefix +
                      "` to `" + server.prefix +
                      "`. Please use the new prefix.");
    }
});

bot.on("ready", () => {
	print("Setting Rich Presence");
	bot.user.setPresence({game:{name:"Knowledge, Strength, Integrity", type:"WATCHING"}});
});

var logFile = fs.readFileSync(logPath, {encoding:"utf-8"});
logs = JSON.parse(logFile);
print("Log file read successfully from " + logPath + ".");

print("Reading file " + settingsPath + ".");
var settingsFile = fs.readFileSync(settingsPath, {encoding:"utf-8"});
settings = JSON.parse(settingsFile);
print("File read successfully.");

print("Reading file " + channelPath + ".");
var channelsFile = fs.readFileSync(channelPath, {encoding:"utf-8"});
servers = JSON.parse(channelsFile);
print("File read successfully.");

bot.login(settings.token).then((token) => {
	if(token) {
		print("Logged in as " + bot.user.tag);
		//print("");
		//print("Secrets:");
		//print("Discord Token: " + token);
		//print("Twitch Client ID: " + settings.twitchClientID);
		//print("Twitter Key: " + settings.twitterKey);
		//print("Twitter Secret: " + settings.twitterSecret);
		//print("Twitter Bearer Token: " + settings.twitterBearerToken);
		//print("YouTube Key: " + settings.youTubeApiKey);
		//print("Facebook Client ID: " + settings.facebookClient);
		//print("Facebook Secret: " + settings.facebookSecret);
		print("");
		var guildArray = bot.guilds.array();
		print("Member of " + guildArray.length + " servers");
		for(let i = 0; i < guildArray.length; i++) {
			print("Serving " + guildArray[i].name + " with " + guildArray[i].memberCount + " users");
		}
		print("");
		
		print("Generating Message Cache");
		
		guildArray.forEach(function(fguild) {
			let channelArray = fguild.channels.array();
			channelArray.forEach(function(fchannel) {
				if (fchannel.type == "text") {
					//print("Caching " + fchannel.name + " in " + fguild.name);
					fchannel.fetchMessages({ limit: 50 })
						.then(messages => print("Successfully cached " + messages.size + " from " + fchannel.name + " in " + fguild.name))
						.catch(console.error);
				}
			});
		});
		/*for (let a = 0; a < bot.guilds.size; a++) {
			//var channelArray = guildArray[a].channels.array();
			for (let b = 0; b < bot.guilds[a].channels.size; b++) {
				if (bot.guilds[a].channels[b].type == "text" && bot.guilds[a].channels[b].manageable) {
					print(`Caching messages from ${bot.guilds[a].channels[b].name} in ${bot.guilds[a].channels[b].guild}`);
					//bot.guilds[a].channels[b].fetchMessages({ limit: 50 })
						//.then(messages => print(`Cached ${messages.size} messages`));
				}
			}
		}*/
		//var channelArray = bot.channels.array();
		//for (let i = 0; i < channelArray.length; i++) {
			//if (channelArray[i].type == "text") {
				//print("Caching messages from " + channelArray[i].name + " in " + channelArray[i].guild.name);
				//let fetchPromise = channelArray[i].fetchMessages({ limit: 10 });
				//let asyncComplete = false;
				//fetchPromise.then(messages => {
					//print("Cached " + messages.array().length + " messages"); 
					//asyncComplete = true; 
				//});
				//while(!asyncComplete){ }
				//channelArray[i].fetchMessages({ limit: 50 })
					//.then(messages => print("Cached " + messages.array().length + " messages"));
			//}
		//}
		
		print("Message Cache Generated Successfully");
		
		tick();
		setInterval(tick, settings.interval);
	} else {
		print("An error occurred while logging in:", err);
		process.exit(1);
	}
});
