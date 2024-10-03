const express = require('express');
const multer = require('multer');
const { MongoClient } = require('mongodb');
const { GridFSBucket } = require('mongodb');
const stream = require('stream');

const app = express();
const port = 3000;

// MongoDB connection string - replace with your actual connection string
const mongoURI = 'mongodb://127.0.0.1:27017/fileUploadDB3';

let db;
let bucket;

// Function to initialize the database
async function initializeDatabase() {
  try {
    const client = await MongoClient.connect(mongoURI, { useNewUrlParser: true, useUnifiedTopology: true });
    console.log('Connected to MongoDB');
    
    db = client.db();
    bucket = new GridFSBucket(db);

    // Create an index on the filename field for faster lookups
    await db.collection('fs.files').createIndex({ filename: 1 });

    console.log('Database initialized successfully');
  } catch (err) {
    console.error('Error initializing database:', err);
    process.exit(1);  // Exit the process if database initialization fails
  }
}

// Initialize the database before starting the server
initializeDatabase().then(() => {
  // Serve static files from the 'public' directory
  app.use(express.static('public'));

  // Configure multer for memory storage
  const storage = multer.memoryStorage();
  const upload = multer({ storage: storage });

  // Handle file upload
  app.post('/upload', upload.array('files'), (req, res) => {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ message: 'No files uploaded.' });
    }

    const uploadPromises = req.files.map(file => {
      return new Promise((resolve, reject) => {
        const readableStream = new stream.PassThrough();
        readableStream.end(file.buffer);

        const uploadStream = bucket.openUploadStream(file.originalname, {
          contentType: file.mimetype
        });

        readableStream.pipe(uploadStream)
          .on('error', reject)
          .on('finish', () => resolve({
            filename: file.originalname,
            id: uploadStream.id
          }));
      });
    });

    Promise.all(uploadPromises)
      .then(results => {
        res.json({ message: 'Files uploaded successfully', files: results });
      })
      .catch(err => {
        console.error('Error uploading files:', err);
        res.status(500).json({ message: 'Error uploading files' });
      });
  });

  // Retrieve a file
  app.get('/file/:filename', (req, res) => {
    bucket.find({ filename: req.params.filename }).toArray((err, files) => {
      if (err) {
        return res.status(500).json({ message: 'Error retrieving file' });
      }
      if (files.length === 0) {
        return res.status(404).json({ message: 'File not found' });
      }
      
      res.set('Content-Type', files[0].contentType);
      const downloadStream = bucket.openDownloadStreamByName(req.params.filename);
      downloadStream.pipe(res);
    });
  });

  // Start the server
  app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
  });
});