// server.js
const http = require('http');
const fs = require('fs');
const url = require('url');
const crypto = require('crypto');

const PORT = 3000;
const DATABASE_FILE = 'database.json';
const ACTIVITY_LOG_FILE = 'activity_log.json';

// Helper functions
function readDatabase() {
  return JSON.parse(fs.readFileSync(DATABASE_FILE, 'utf8'));
}

function writeDatabase(data) {
  fs.writeFileSync(DATABASE_FILE, JSON.stringify(data, null, 2));
}

function readActivityLog() {
  return JSON.parse(fs.readFileSync(ACTIVITY_LOG_FILE, 'utf8'));
}

function writeActivityLog(data) {
  fs.writeFileSync(ACTIVITY_LOG_FILE, JSON.stringify(data, null, 2));
}

function generateToken() {
  return crypto.randomBytes(16).toString('hex');
}

const server = http.createServer((req, res) => {
  const parsedUrl = url.parse(req.url, true);
  const path = parsedUrl.pathname;

  if (path === '/') {
    fs.readFile('index.html', (err, data) => {
      if (err) {
        res.writeHead(500);
        res.end('Error loading index.html');
      } else {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(data);
      }
    });
  } else if (path === '/register' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => {
      body += chunk.toString();
    });
    req.on('end', () => {
      const { username, password, pin } = JSON.parse(body);
      const database = readDatabase();
      
      if (database.users[username]) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ message: 'Username already exists. Please try another username.' }));
      } else {
        const newUser = {
          username,
          password,
          pin,
          balance: 0,
          registrationTime: Math.floor(Date.now() / 1000)
        };
        database.users[username] = newUser;
        database.lastRegistrationSerial++;
        writeDatabase(database);
        
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ message: 'Registered successfully!' }));
      }
    });
  } else if (path === '/login' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => {
      body += chunk.toString();
    });
    req.on('end', () => {
      const { username, password, pin } = JSON.parse(body);
      const database = readDatabase();
      
      if (database.users[username] && 
          database.users[username].password === password && 
          database.users[username].pin === pin) {
        const token = generateToken();
        const expirationTime = Math.floor(Date.now() / 1000) + 4 * 60 * 60; // 4 hours
        database.tokens[token] = { username, expirationTime };
        writeDatabase(database);
        
        // Log user activity
        const activityLog = readActivityLog();
        activityLog.push({
          username,
          loginTime: Math.floor(Date.now() / 1000)
        });
        writeActivityLog(activityLog);
        
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ token, username }));
      } else {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ message: 'Account details don\'t match.' }));
      }
    });
  } else if (path.startsWith('/api/') && req.method === 'GET') {
    const token = parsedUrl.query.token;
    const database = readDatabase();
    
    if (database.tokens[token] && database.tokens[token].expirationTime > Math.floor(Date.now() / 1000)) {
      const username = database.tokens[token].username;
      const user = database.users[username];
      
      if (path === `/api/${username}/profile`) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          username: user.username,
          password: user.password,
          pin: user.pin
        }));
      } else if (path === `/api/${username}/transactions`) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(user.transactions || []));
      } else if (path === `/api/${username}/balance`) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ balance: user.balance }));
      } else {
        res.writeHead(404);
        res.end('Not found');
      }
    } else {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ message: 'Unauthorized' }));
    }
  } else if (path === '/api/transfer' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => {
      body += chunk.toString();
    });
    req.on('end', () => {
      const { token, recipient, amount } = JSON.parse(body);
      const database = readDatabase();
      
      if (database.tokens[token] && database.tokens[token].expirationTime > Math.floor(Date.now() / 1000)) {
        const senderUsername = database.tokens[token].username;
        const sender = database.users[senderUsername];
        const recipientUser = database.users[recipient];
        
        if (recipientUser && sender.balance >= amount) {
          sender.balance -= amount;
          recipientUser.balance += amount;
          
          const transaction = {
            time: Math.floor(Date.now() / 1000),
            type: 'send',
            amount,
            balance: sender.balance
          };
          
          if (!sender.transactions) sender.transactions = [];
          sender.transactions.push(transaction);
          
          if (!recipientUser.transactions) recipientUser.transactions = [];
          recipientUser.transactions.push({
            time: Math.floor(Date.now() / 1000),
            type: 'received',
            amount,
            balance: recipientUser.balance
          });
          
          writeDatabase(database);
          
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ message: 'Transfer successful' }));
        } else {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ message: 'Invalid recipient or insufficient funds' }));
        }
      } else {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ message: 'Unauthorized' }));
      }
    });
  } else {
    res.writeHead(404);
    res.end('Not found');
  }
});

server.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}/`);
});

// Initialize database if it doesn't exist
if (!fs.existsSync(DATABASE_FILE)) {
  const initialData = {
    lastRegistrationSerial: 0,
    users: {},
    tokens: {}
  };
  writeDatabase(initialData);
}

// Initialize activity log if it doesn't exist
if (!fs.existsSync(ACTIVITY_LOG_FILE)) {
  writeActivityLog([]);
      }
