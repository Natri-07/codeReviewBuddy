import express from 'express';
// Add deleteFile to this import line
import { saveFile, loadFile, listFiles, deleteFile } from '../controllers/fileController.js';

const router = express.Router();

router.post('/save', saveFile);
router.get('/load', loadFile);
router.get('/list', listFiles);

// Add this new route
router.post('/delete', deleteFile);

export default router;