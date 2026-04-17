require('dotenv').config();
const express = require('express');
const cors    = require('cors');

const app = express();

app.use(cors());
app.use(express.json());

// Routes
app.use('/api/auth',       require('./src/routes/auth'));
app.use('/api/workouts',   require('./src/routes/workouts'));
app.use('/api/challenges', require('./src/routes/challenges'));
app.use('/api/groups',     require('./src/routes/groups'));
app.use('/api/admin',      require('./src/routes/admin'));
app.use('/api/users',      require('./src/routes/users'));

app.get('/api/health', (req, res) => res.json({ status: 'ok' }));

app.use((err, req, res, next) => {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`StepCounter API running on port ${PORT}`));
