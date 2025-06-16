const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');

const cookieParser = require('cookie-parser');
const { PrismaClient } = require('@prisma/client');
const app = express();
const prisma = new PrismaClient();
app.use(express.static('public'));
const jwt = require('jsonwebtoken');
const JWT_SECRET = 'randomSecretfortest123'; 

app.use(cors({
  origin: 'http://localhost:3000',  // your frontend origin
  credentials: true
}));

app.use(bodyParser.urlencoded({ extended: false }));
app.use(cookieParser());

// Simple in-memory sessions (for demo only)
const sessions = {};

// Middleware to get user from cookie
app.use(async (req, res, next) => {
  const sessionId = req.cookies.sessionId;
  if (sessionId && sessions[sessionId]) {
    req.userId = sessions[sessionId];
    req.user = await prisma.user.findUnique({ where: { id: req.userId } });
  }
  next();
});

// Serve signup page
app.get('/signup', (req, res) => {
  res.sendFile(__dirname + '/public/signup.html');
});

app.get('/login', (req, res) => {
  res.sendFile(__dirname + '/public/login.html');
});
app.get('/api/dashboard', authenticateJWT, async (req, res) => {
  try {
    // Find current user info
    const currentUser = await prisma.user.findUnique({
      where: { id: req.user.userId },
      select: { username: true, balance: true },
    });

    // Find all other users to populate dropdown
    const users = await prisma.user.findMany({
      where: { id: { not: req.user.userId } },
      select: { username: true },
    });

    // Return data as JSON
    res.json({
      current: currentUser.username,
      balance: currentUser.balance,
      users,
    });
  } catch (err) {
    console.error(err);
    res.status(500).send('Server error');
  }
});


// Handle signup
app.post('/signup', async (req, res) => {
  const { username, password } = req.body;
  try {
    const user = await prisma.user.create({
      data: { username, password, balance: 1000 },
    });
    res.redirect('/login');
  } catch (e) {
    res.send('Error creating user: ' + e.message);
  }
});


app.post('/login', async (req, res) => {
  const { username, password } = req.body;
  const user = await prisma.user.findUnique({ where: { username } });

  if (user && user.password === password) {
    
    const payload = { userId: user.id, username: user.username };
    
   
    const token = jwt.sign(payload, JWT_SECRET, { expiresIn: '1h' });
    
   
    res.cookie('token', token, { httpOnly: true });
    
    
    res.redirect('/account');
  } else {
    res.send('Invalid credentials');
  }
});
function authenticateJWT(req, res, next) {
  const token = req.cookies.token;
  if (!token) return res.redirect('/login'); // or res.status(401).send('Unauthorized');

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.redirect('/login'); // or res.status(403).send('Forbidden');
    req.user = user; // attach decoded payload to request
    next();
  });
}



app.get('/account', authenticateJWT, async (req, res) => {
  if (!req.user) return res.redirect('/login');
  res.sendFile(__dirname + '/public/dashboard.html');
});
app.post('/transfer', authenticateJWT, async (req, res) => {
  const { to, amount } = req.body;
  const transferAmount = parseFloat(amount);

  if (transferAmount <= 0) return res.send('Invalid amount');

  const fromUser = await prisma.user.findUnique({ where: { id: req.user.userId } });
  const toUser = await prisma.user.findUnique({ where: { username: to } });

  if (!toUser) return res.send('Recipient not found');
  if (fromUser.balance < transferAmount) return res.send('Insufficient balance');

  await prisma.user.update({
    where: { id: fromUser.id },
    data: { balance: fromUser.balance - transferAmount },
  });

  await prisma.user.update({
    where: { id: toUser.id },
    data: { balance: toUser.balance + transferAmount },
  });

  res.redirect('/account');

});
// Logout
app.get('/logout', (req, res) => {
  res.clearCookie('token');
  res.redirect('/login');
});


app.listen(3000, () => {
  console.log('Server running at http://localhost:3000');
});

