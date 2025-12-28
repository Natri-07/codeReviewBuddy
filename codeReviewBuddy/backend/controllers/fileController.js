import { writeFile, readFile, executeCommand, createContainer, getContainer } from './dockerManager.js';

// Cleanup shared workspace on server shutdown
process.on('SIGINT', async () => {
  console.log('Cleaning up shared workspace...');
  try {
    const { cleanupContainer } = await import('./dockerManager.js');
    await cleanupContainer('shared-workspace');
  } catch (error) {
    console.error('Error cleaning up workspace:', error);
  }
  process.exit(0);
});

export const saveFile = async (req, res) => {
  try {
    const { sessionId, fileName, content } = req.body;
    const workspaceId = 'shared-workspace'; // Use shared workspace
    
    if (!fileName || content === undefined) {
      return res.status(400).json({ error: 'Missing required fields' });
    }
    
    // Ensure shared container exists
    let container = getContainer(workspaceId);
    if (!container) {
      container = await createContainer(workspaceId);
    }
    
    await writeFile(workspaceId, fileName, content);
    
    res.json({ 
      success: true, 
      message: `File ${fileName} saved successfully` 
    });
    
  } catch (error) {
    console.error('Error saving file:', error);
    res.status(500).json({ error: error.message });
  }
};

export const loadFile = async (req, res) => {
  try {
    const { fileName } = req.query;
    const workspaceId = 'shared-workspace'; // Use shared workspace
    
    if (!fileName) {
      return res.status(400).json({ error: 'Missing fileName' });
    }
    
    // Ensure shared container exists
    let container = getContainer(workspaceId);
    if (!container) {
      container = await createContainer(workspaceId);
    }
    
    const content = await readFile(workspaceId, fileName);
    
    res.json({ 
      success: true, 
      content,
      fileName 
    });
    
  } catch (error) {
    console.error('Error loading file:', error);
    res.status(500).json({ error: error.message });
  }
};

export const listFiles = async (req, res) => {
  try {
    const workspaceId = 'shared-workspace'; // Use shared workspace
    
    // Check if shared container exists, if not create it
    let container = getContainer(workspaceId);
    if (!container) {
      try {
        container = await createContainer(workspaceId);
      } catch (createError) {
        console.log('Container creation failed, returning empty file list');
        return res.json({ success: true, files: [] });
      }
    }
    
    const output = await executeCommand(workspaceId, 'ls -la /workspace');
    const files = output.trim().split('\n')
      .filter(line => line.trim() && !line.startsWith('total') && !line.startsWith('d'))
      .map(line => {
        const parts = line.split(/\s+/);
        const fileName = parts[parts.length - 1];
        if (fileName && fileName !== '.' && fileName !== '..') {
          return {
            name: fileName,
            path: fileName,
            type: 'file'
          };
        }
        return null;
      })
      .filter(file => file !== null);
    
    res.json({ 
      success: true, 
      files 
    });
    
  } catch (error) {
    console.error('Error listing files:', error);
    res.json({ success: true, files: [] });
  }
};

// Add this to the bottom of your fileController.js
export const deleteFile = async (req, res) => {
  try {
    const { fileName } = req.body;
    const workspaceId = 'shared-workspace';

    if (!fileName) {
      return res.status(400).json({ error: 'Missing fileName' });
    }

    // Ensure the container exists before trying to delete from it
    let container = getContainer(workspaceId);
    if (!container) {
      return res.status(404).json({ error: 'Workspace container not found' });
    }

    // Physically remove the file from the /workspace directory
    await executeCommand(workspaceId, `rm -f "/workspace/${fileName}"`);

    res.json({
      success: true,
      message: `File ${fileName} deleted successfully from container`
    });

  } catch (error) {
    console.error('Error deleting file:', error);
    res.status(500).json({ error: error.message });
  }
};