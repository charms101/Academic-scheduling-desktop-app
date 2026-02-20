const { app, BrowserWindow, screen } = require('electron') //imports apps, window and screen details
const path = require('path')

function createWindow() { //a wraped fxn we can call when electron is ready
    const { width, height } = screen.getPrimaryDisplay().workAreaSize //getting monitors usable size

    const widgetWidth = 320 //how much width the app will have 
    const widgetHeight = 500 //how much height the app will have

    const win = new BrowserWindow({ //creates a new window
        width: widgetWidth,
        height: widgetHeight,

        //positioning where you see your app
        x: width - widgetWidth - 40,
        y: height - widgetHeight - 20,

        frame: false, //no mac frame like red yellow button on top
        transparent: true, //window background see-through so it blends into your desktop.
        alwaysOnTop: false, //meaning your other app windows will go on top of it, just like a wallpaper widget.
        hasShadow: false, //Removes the macOS drop shadow around the window so it looks cleaner
        resizable: false, //Prevents you from accidentally resizing it by dragging the edges.

        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false,
            //nppreload: path.join(__dirname, 'src/renderer.js')
        }
    })

    win.loadFile('src/index.html')
    //win.webContents.openDevTools({ mode: 'detach' })  // add this line
    win.setVisibleOnAllWorkspaces(true)

}

app.whenReady().then(createWindow)

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
