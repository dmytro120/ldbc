class LDBC
{
	constructor()
	{
		console.log("\x1b[32m", '\r\n'+
			' 888      8888888b.  888888b.    .d8888b.  '+'\r\n'+
			' 888      888  "Y88b 888  "88b  d88P  Y88b '+'\r\n'+
			' 888      888    888 888  .88P  888    888 '+'\r\n'+
			' 888      888    888 8888888K.  888        '+'\r\n'+
			' 888      888    888 888  "Y88b 888        '+'\r\n'+
			' 888      888    888 888    888 888    888 '+'\r\n'+
			' 888      888  .d88P 888   d88P Y88b  d88P '+'\r\n'+
			' 88888888 8888888P"  8888888P"   "Y8888P"  '+'\r\n'
		);
		this.pathToConfig = process.env['LOCALAPPDATA'] + '/LDBC/config.js';
		
		this.fs = require('fs');
		this.dialog = require('dialog');
		this.http = require('http');
		
		var pool = require('odbc-pool');
		this.pool = new pool({min : 1, max : 10, log : false});
		
		var stdin = process.openStdin(); 
		stdin.setRawMode(true);
		process.stdin.resume();
		process.stdin.on('data', this.processKey.bind(this));
		
		process.on('SIGTERM', this.exit.bind(this)).on('SIGINT', this.exit.bind(this));
		
		this.loadConfig();
	}
	
	loadConfig()
	{
		if (this.fs.existsSync(this.pathToConfig)) {
			this.config = require(this.pathToConfig);
			
			if (!this.config.connectionStrings || Object.keys(this.config.connectionStrings).length < 1) {
				this.dialog.err('Cannot start LDBC.\r\n\r\nNo connection strings in config file:\r\n' + this.pathToConfig.replace(/\//g, "\\"), 'LDBC Error', e => {
					process.exit(1);
				});
				return;
			}
			this.connectionStrings = this.config.connectionStrings;
			
			if (!this.config.host) this.config.host = 'localhost';
			if (!this.config.port) this.config.port = 7000;
			
			console.log(
				'┌────────────────────────────────────────────┐'+'\r\n'+
				'│ LabSys DataBase Connector (LDBC)           │'+'\r\n'+
				'│ http://dmytro.malikov.us/labsys/           │'+'\r\n'+
				'├────────────────────────────────────────────┤'
			);
			var c = 1;
			for (var name in this.connectionStrings) {
				console.log('│ ' + (c + ': ' + name + ' '.repeat(42)).slice(0,42) + ' │');
				c++;
			}
			console.log(
				'└────────────────────────────────────────────┘'+'\r\n'
			);
			
			this.currentKey = Object.keys(this.connectionStrings)[0];
			this.openConnection();
		} else {
			this.dialog.err('Cannot start LDBC.\r\n\r\nDB configuration file not found:\r\n' + this.pathToConfig.replace(/\//g, "\\"), 'LDBC Error', e => {
				process.exit(1)
			});
		}
	}
	
	openConnection(key, thenFn)
	{
		if (!this.serverOn) this.startServer();
		if (!key) key = this.currentKey;
		console.log('\x1b[0m', 'Connecting to ' + key + '...');
		
		this.pool.open(this.connectionStrings[key], (err, client) => {
			if (err) {
				if (err.state == '01000' || err.state == '08S01') {
					this.openConnection(key, thenFn);
				} else {
					console.log('\x1b[91m', err.message, '\n', '\x1b[0m');
					this.client = null;
				}
				return;
			}
			console.log('\x1b[92m', 'OK\n', '\x1b[0m');
			
			this.client = client;
			if (thenFn) thenFn.call(this);
		});
	}
	
	switchConnection(no, thenFn)
	{
		var targetKey = no ? Object.keys(this.connectionStrings)[no-1] : this.currentKey;
		
		if (targetKey) {
			if (targetKey != this.currentKey) {
				this.config.connectionStrings = {};
				this.config.connectionStrings[targetKey] = this.connectionStrings[targetKey];
				for (let k in this.connectionStrings) {
					this.config.connectionStrings[k] = this.connectionStrings[k];
				}
				this.writeConfig();
			}
			
			if (this.client) {
				this.client.close(e => {
					this.currentKey = targetKey;
					this.openConnection(null, thenFn);
				});
			} else {
				this.currentKey = targetKey;
				this.openConnection(null, thenFn);
			}
		}
	}
	
	startServer()
	{
		this.http
			.createServer(this.handleRequest.bind(this))
			.listen(this.config.port, this.config.host)
			.on('error', err => {
				var exitMsg;
				switch (err.code) {
					case 'EADDRINUSE': exitMsg = 'Cannot start LDBC.\r\nAnother process is using port ' + this.config.port + '.'; break;
					default: exitMsg = err.message; break;
				}
				this.dialog.err(exitMsg, 'LDBC Error', e => {
					process.exit(1);
				}) 
			});

		console.log('\x1b[36m%s\x1b[0m', " LDBC up at http://" + this.config.host + ":" + this.config.port + '\r\n');
		this.serverOn = true;
	}

	handleRequest(request, response)
	{
		response.setHeader('Access-Control-Allow-Origin', '*');

		var urlparts = request.url.split("/");
		var qry = decodeURIComponent(urlparts[1]);

		if (qry == 'favicon.ico') {
			response.end();
			return;
		}
		
		if (!this.client) {
			response.writeHead(400, {"Content-Type": "text/plain"});
			response.write('LDBC is not connected to a database.');
			response.end();
			return;
		}
		
		try {
			var rows = this.client.querySync(qry);
		}
		catch (err) {
			if (err.state && (err.state == '01000' || err.state == '08S01')) {
				this.switchConnection(null, e => {
					this.handleRequest(request, response);
				});
			} else {
				response.writeHead(400, {"Content-Type": "text/plain"});
				response.write(err.message);
				response.end();
			}
			return;
		}
		response.writeHead(200, {"Content-Type": "application/json"});
		response.write(JSON.stringify(rows));
		
		response.end();
	}
	
	processKey(key)
	{
		if (key == '\u0003') {
			this.exit();
			return;
		}
		if (key >= '\u0031' && key <= '\u0039') {
			var no = parseInt(key);
			this.switchConnection(no);
		}
		if (key == '\u0070') {
			// p
		}
	}
	
	writeConfig(thenFn)
	{
		var out = "module.exports = " + JSON.stringify(this.config, null, '\t') + ";";
		this.fs.writeFile(this.pathToConfig, out, error => {
			if (error) this.dialog.err(error, 'LDBC Error', e => {
				//process.exit(1);
			})
			else if (thenFn) thenFn();
		});
	}
	
	exit()
	{
		console.log(" Goodbye!");
		process.exit(0);
	}
}

new LDBC;