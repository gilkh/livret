const mongoose = require('mongoose');
mongoose.connect('mongodb://127.0.0.1:27017/nvcar').then(async () => {
    const db = mongoose.connection.db;
    const docs = await db.collection('templateassignments').find({ 'data.signatures': { $exists: true, $not: { $size: 0 } } }).limit(1).toArray();
    console.log(JSON.stringify(docs[0]?.data?.signatures || [], null, 2));
    process.exit(0);
});
