import { useState, useEffect } from 'react'
import Editor from './editor.jsx'
import FileExplorer from './components/FileExplorer.jsx'
import EditorTabs from './components/EditorTabs.jsx'
import AIChat from './components/AIChat.jsx'
import Terminal from './components/Terminal.jsx'
import StatusBar from './components/StatusBar.jsx'
import Welcome from './components/Welcome.jsx'
import axios from 'axios'
import { v4 as uuidv4 } from 'uuid'
import { io } from 'socket.io-client'

function App() {
  const [theme, setTheme] = useState('dark'); // Starts in dark mode
  const [isLightMode, setIsLightMode] = useState(false);
  const [files, setFiles] = useState([])
  const [sessionId, setSessionId] = useState(null)
  const [openFiles, setOpenFiles] = useState([])
  const [activeFile, setActiveFile] = useState(null)
  const [output, setOutput] = useState('')
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [activeBottomTab, setActiveBottomTab] = useState('output')
  

  // Initialize session and sync files
  useEffect(() => {
    const socket = io('http://localhost:5000')

    socket.on('connect', () => {
      console.log('Connected with session ID:', socket.id)
      setSessionId(socket.id)
    })

    // Listen for real-time file changes
    socket.on('files-changed', (data) => {
      console.log('Files changed:', data.files)
      const containerFiles = data.files.map(file => ({
        id: uuidv4(),
        name: file.name,
        content: '', // Will be loaded when opened
        language: getLanguageFromExtension(file.name),
        containerPath: file.path,
        modified: file.modified
      }))
      setFiles(containerFiles)
    })

    // Listen for terminal file changes
    socket.on('files-changed-from-terminal', () => {
      refreshFiles()
    })

    // Listen for broadcast file changes
    socket.on('files-changed-broadcast', () => {
      refreshFiles()
    })

    // Start file watching when container is ready
    socket.on('terminal-output', (data) => {
      if (data.includes('Sandbox ready')) {
        setTimeout(() => {
          socket.emit('start-file-watching')
        }, 1000)
      }
    })

    return () => {
      socket.disconnect()
    }
  }, [])

  const refreshFiles = async () => {
    try {
      const response = await axios.get(`http://localhost:5000/api/files/list`)

      if (response.data.success) {
        const containerFiles = response.data.files.map(file => ({
          id: uuidv4(),
          name: file.name,
          content: '', // Will be loaded when opened
          language: getLanguageFromExtension(file.name),
          containerPath: file.path
        }))
        setFiles(containerFiles);
      }
    } catch (error) {
      console.error('Error refreshing files:', error)
    }
  }

  const getLanguageFromExtension = (fileName) => {
    const ext = fileName.split('.').pop()
    const langMap = {
      'py': 'python',
      'js': 'javascript',
      'java': 'java',
      'cpp': 'cpp',
      'c': 'c',
      'html': 'html',
      'css': 'css',
      'r': 'r',
      'R': 'r'
    }
    return langMap[ext] || 'plaintext'
  }

  const handleFileSelect = async (file) => {
    // Load file content from container if not already loaded
    if (!file.content && file.containerPath) {
      try {
        const response = await axios.get(`http://localhost:5000/api/files/load?fileName=${file.containerPath}`)
        if (response.data.success) {
          // Convert escaped characters to actual characters
          file.content = response.data.content
            .replace(/\\n/g, '\n')
            .replace(/\\t/g, '\t')
            .replace(/\\r/g, '\r')
            .replace(/&quot;/g, '"')
            .replace(/&amp;/g, '&')
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
        }
      } catch (error) {
        console.error('Error loading file:', error)
        file.content = '// Error loading file'
      }
    }

    if (!openFiles.find(f => f.id === file.id)) {
      setOpenFiles([...openFiles, file])
    }
    setActiveFile(file)
  }

  const handleFileClose = (fileId) => {
    const newOpenFiles = openFiles.filter(f => f.id !== fileId)
    setOpenFiles(newOpenFiles)
    if (activeFile?.id === fileId) {
      setActiveFile(newOpenFiles[0] || null)
    }
  }

  const handleFileCreate = async (newFile) => {
    try {
      // Save file to shared workspace
      await axios.post('http://localhost:5000/api/files/save', {
        fileName: newFile.name,
        content: newFile.content || ''
      })

      // Add to local files
      const fileWithContainer = {
        ...newFile,
        containerPath: newFile.name
      }
      setFiles([...files, fileWithContainer])

      // Refresh files to sync with container
      setTimeout(() => refreshFiles(), 500)

    } catch (error) {
      console.error('Error creating file:', error)
    }
  }

  const handleFileDelete = async (fileId) => {
    const fileToDelete = files.find(f => f.id === fileId);
    if (!fileToDelete) return;

    if (!window.confirm(`Permanently delete ${fileToDelete.name}?`)) return;

    try {
      // 1. Delete from Server
      await axios.post('http://localhost:5000/api/files/delete', {
        fileName: fileToDelete.name
      });

      // 2. Remove from Explorer List
      setFiles(prev => prev.filter(f => f.id !== fileId));

      // 3. IMPORTANT: Remove from Open Tabs (The "Home Screen" issue)
      setOpenFiles(prev => prev.filter(f => f.id !== fileId));

      // 4. If we were looking at that file, clear the view
      if (activeFile && activeFile.id === fileId) {
        setActiveFile(null);
      }

    } catch (error) {
      console.error('Deletion error:', error);
    }
  };
  const handleCodeChange = async (fileId, newContent) => {
    // Update local state
    setFiles(files.map(f =>
      f.id === fileId ? { ...f, content: newContent } : f
    ))
    setOpenFiles(openFiles.map(f =>
      f.id === fileId ? { ...f, content: newContent } : f
    ))
    if (activeFile?.id === fileId) {
      setActiveFile({ ...activeFile, content: newContent })
    }

    // Save to shared workspace (debounced)
    const file = files.find(f => f.id === fileId)
    if (file && file.containerPath) {
      try {
        await axios.post('http://localhost:5000/api/files/save', {
          fileName: file.containerPath,
          content: newContent
        })
      } catch (error) {
        console.error('Error saving file:', error)
      }
    }
  }

  const executeCode = async () => {
    if (!activeFile) return

    setLoading(true)
    try {
      const response = await axios.post('http://localhost:5000/api/code/execute', {
        language: activeFile.language,
        code: activeFile.content,
        stdin: input
      })

      const result = response.data
      setOutput(result.run?.stdout || result.run?.stderr || 'No output')
    } catch (error) {
      setOutput(`Error: ${error.message}`)
    }
    setLoading(false)
  }
  // Initial width is 250px
  const [leftWidth, setLeftWidth] = useState(250);

  const handleLeftMouseDown = (e) => {
    // Prevent text selection while dragging
    e.preventDefault();

    const startX = e.clientX;
    const startWidth = leftWidth;

    const onMouseMove = (moveE) => {
      // Calculate how far the mouse moved
      const newWidth = startWidth + (moveE.clientX - startX);

      // Limits: Don't let the sidebar get too small (150px) or too big (500px)
      if (newWidth > 150 && newWidth < 500) {
        setLeftWidth(newWidth);
      }
    };

    const onMouseUp = () => {
      // Stop listening when the user lets go of the mouse
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
      document.body.style.cursor = 'default';
    };

    // Add listeners to the whole window so dragging is smooth
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
    document.body.style.cursor = 'col-resize';
  };

  // 1. New States
  const [rightWidth, setRightWidth] = useState(300);
  const [bottomHeight, setBottomHeight] = useState(200);

  // 2. Right Sidebar Handler (Horizontal Drag)
  const handleRightMouseDown = (e) => {
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = rightWidth;

    const onMouseMove = (moveE) => {
      // Note the minus sign: as mouse moves left, width increases
      const newWidth = startWidth - (moveE.clientX - startX);
      if (newWidth > 200 && newWidth < 600) setRightWidth(newWidth);
    };

    const onMouseUp = () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
      document.body.style.cursor = 'default';
    };

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
    document.body.style.cursor = 'col-resize';
  };

  // 3. Bottom Panel Handler (Vertical Drag)
  const handleBottomMouseDown = (e) => {
    e.preventDefault();
    const startY = e.clientY;
    const startHeight = bottomHeight;

    const onMouseMove = (moveE) => {
      // Note the minus sign: as mouse moves up, height increases
      const newHeight = startHeight - (moveE.clientY - startY);
      if (newHeight > 100 && newHeight < 500) setBottomHeight(newHeight);
    };

    const onMouseUp = () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
      document.body.style.cursor = 'default';
    };

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
    document.body.style.cursor = 'row-resize';
  };

  return (
    <div className={`app-container ${theme}-theme`}>
      <div className="main-layout">

        {/* 1. LEFT SIDEBAR (Explorer) */}
        <div className="sidebar" style={{ width: `${leftWidth}px` }}>
          <FileExplorer
            files={files}
            onFileSelect={handleFileSelect}
            onFileCreate={handleFileCreate}
            onFileDelete={handleFileDelete}
            activeFile={activeFile}
            onRefresh={() => refreshFiles()}
          />
        </div>

        {/* VERTICAL RESIZER (LEFT) */}
        <div className="resizer resizer-left" onMouseDown={handleLeftMouseDown} />

        

        {/* 2. MAIN CONTENT AREA */}
        <div className="main-content">
          <div className="editor-section">
            <EditorTabs
              openFiles={openFiles}
              activeFile={activeFile}
              onFileSelect={setActiveFile}
              onFileClose={handleFileClose}
            />

            <div className="controls">
              <button className="home-btn" onClick={() => setActiveFile(null)}>🏠 Home</button>
              <button onClick={executeCode} disabled={loading || !activeFile}>
                {loading ? 'Running...' : 'Run Code'}
              </button>
              <button className="theme-toggle-btn" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}>
                {theme === 'dark' ? '☀️ Light' : '🌙 Dark'}
              </button>
            </div>

            <div className="editor-container">
              {activeFile ? (
                <Editor file={activeFile} onCodeChange={handleCodeChange} />
              ) : (
                <Welcome onCreateFile={handleFileCreate} />
              )}
            </div>
          </div>

          {/* HORIZONTAL RESIZER (BOTTOM) */}
          <div className="resizer-h" onMouseDown={handleBottomMouseDown} />

          {/* 3. BOTTOM PANEL (Output/Terminal) */}
          <div className="bottom-panel" style={{ height: `${bottomHeight}px` }}>
            <div className="panel-tabs">
              <button
                className={`tab-btn ${activeBottomTab === 'output' ? 'active' : ''}`}
                onClick={() => setActiveBottomTab('output')}
              >Output</button>
              <button
                className={`tab-btn ${activeBottomTab === 'terminal' ? 'active' : ''}`}
                onClick={() => setActiveBottomTab('terminal')}
              >Terminal</button>
            </div>
            <div className="panel-content">
              {activeBottomTab === 'output' && (
                <div className="output-container">
                  <div className="input-section">
                    <label>Program Input:</label>
                    <textarea
                      value={input}
                      onChange={(e) => setInput(e.target.value)}
                      placeholder="Enter inputs..."
                      rows="3"
                      className="input-box"
                    />
                  </div>
                  <h3>Output:</h3>
                  <pre>{output}</pre>
                </div>
              )}
              {activeBottomTab === 'terminal' && <Terminal />}
            </div>
          </div>
        </div>

        {/* VERTICAL RESIZER (RIGHT) */}
        <div className="resizer resizer-right" onMouseDown={handleRightMouseDown} />

        {/* 4. RIGHT SIDEBAR (AI Chat) */}
        <div className="right-sidebar" style={{ width: `${rightWidth}px` }}>
          <AIChat activeFile={activeFile} />
        </div>
      </div>

      <StatusBar activeFile={activeFile} loading={loading} />
    </div>
  );
};
export default App