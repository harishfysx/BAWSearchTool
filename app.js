const express = require('express');
const multer = require('multer');
const ejs = require('ejs');
const path = require('path');
const unzip = require('unzip');
const fs = require('fs');
var extract = require('extract-zip');
const resolve = require('path').resolve;
var xpath = require('xpath');
const findInFiles = require('find-in-files');
const dom = require('xmldom').DOMParser;
const fsPromises = require('fs').promises;
const fsExtra = require('fs-extra');
var bodyParser = require('body-parser');
var exec = require('child_process').exec;
var shell = require('shelljs');
// Set The Storage Engine
const storage = multer.diskStorage({
    destination: './public/uploads/',
    filename: function(req, file, cb) {
        cb(null, file.originalname);
    }
});
// Init Upload
const upload = multer({
    storage: storage,
    limits: {
        fileSize: 100000000
    },
    fileFilter: function(req, file, cb) {
        checkFileType(file, cb);
    }
}).single('myImage');
// Check File Type
function checkFileType(file, cb) {
    // Allowed ext
    const filetypes = /twx|zip|pdf/;
    // Check ext
    const extname = filetypes.test(path.extname(file.originalname).toLowerCase());
    // Check mime
    const mimetype = filetypes.test(file.mimetype);
    if (extname) {
        return cb(null, true);
    } else {
        cb('Error: TWX Files Only!');
    }
}
// Init app
const app = express();
app.use(bodyParser.urlencoded({
    extended: true
}));
// EJS
app.set('view engine', 'ejs');
// Public Folder
app.use(express.static('./public'));
// parse application/json
app.get('/', (req, res) => {
    var fileStatus;
    if (fs.readdirSync('./public/uploads').length === 0) {
        fileStatus = "File Doesnt Exist"
    } else {
        fileStatus = "File Exists"
    }
    res.render('index', {
        msg: fileStatus
    });
});
app.get('/searchTwx', (req, res) => {
    var fileNames = fs.readdirSync('./public/uploads');
    res.render('searchTwx', {
        fileNames
    })
});
app.post('/upload', (req, res) => {
    upload(req, res, (err) => {
        if (err) {
            res.render('index', {
                msg: err
            });
        } else {
            if (req.file == undefined) {
                res.render('index', {
                    msg: 'Error: No File Selected!'
                });
            } else {
                console.log(req.file.filename);
                var resolvedUnpackPath = resolve(`./public/extractedFiles`);
                extract(`./public/uploads/${req.file.filename}`, {
                    dir: resolvedUnpackPath
                }, function(err) {
                    // handle err
                    console.log(err);
                })
                res.redirect('/searchTwx');
            }
        }
    });
});
app.post('/deleteTwx', (req, res) => {
    deleteTwxs();
    res.redirect('/')
});
app.post('/serchExtracted', (req, res) => {
    console.log(req.body.searchTerm);
    exec("grep -nlr " + req.body.searchTerm + " ./public/extractedFiles/objects", (error, stdout, stderr) => {
        if (error) {
            //console.log(`error: ${error.message}`);
            return;
        }
        if (stderr) {
            console.log(`stderr: ${stderr}`);
            return;
        }
        var testArray = stdout.split("\n");
        var matchedObjectNames = [];
        testArray.forEach(function(filePath, index) {
         
            if (filePath) {
              var matchedObj = {};
              var data = fs.readFileSync(filePath, {
                  encoding: 'UTF-8'
              });
              var doc = new dom().parseFromString(data);
              matchedObj.objectName = xpath.select('string((//@name)[1])', doc);
                //console.log(filePath, index);
                var assetType = '';
                if (filePath.includes('/64.')) {
                    assetType = "CoachView";
                } else if (filePath.includes('/1.2c48639b')) {
                    assetType = "Script";
                    var nodes = xpath.select("//@*[contains(.,'multiDataSeries')]", doc);
                    for(var i=0; i<nodes.length; i++){
                      console.log(nodes[i].ownerElement.nodeName);
                    }
                   
                  
                  //var keys = Object.keys(nodes[0]ownerElement.nodeName);
                  //var keys = Object.keys(nodes.nodes[0].ownerElement.nodeName);
                 // console.log("##################", keys);
                  //console.log(nodes.nodes[0].ownerElement.nodeName);
                   /*
                   
                  */
                }
                matchedObj['assetType'] = assetType;
                matchedObjectNames.push(matchedObj)
            }
        });
        //console.log(matchedObjectNames);
        res.render('searchTwx', {
            msg: "serach results for : " + req.body.searchTerm,
            matchedObjectNames
        })
    });
})
deleteTwxs = function() {
    const extractedDir = "./public/extractedFiles";
    const twxDirectory = "./public/uploads";
    fsExtra.emptyDirSync(extractedDir);
    fsExtra.emptyDirSync(twxDirectory);
}

function testJS() {
    console.log("Test file");
    var data = fs.readFileSync('./public/extractedFiles/objects/72.991cce5f-38b0-47b3-9ffe-452ba0ef756d.xml', {
        encoding: 'UTF-8'
    });
    // Create an XMLDom Element:
    var doc = new dom().parseFromString(data);
    //var childNodes = xpath.select('/teamworks/process/item', doc);
    var childNodes = xpath.select('string((//@name)[1])', doc);
    console.log(childNodes);
    //var splittedLinesArray = childNodes[0].firstChild.data.split("\n");
    //var index= splittedLinesArray.findIndex(el => el.includes("InstanceCreationTest"));
    //console.log(index+1 );
    /*
        exec('grep -nlr "99999*"  "./public/extractedFiles/objects"' , (error, stdout, stderr) => {
          if (error) {
              console.log(`error: ${error.message}`);
              return;
          }
          if (stderr) {
              console.log(`stderr: ${stderr}`);
              return;
          }
          var testArray=  stdout.split("\n");
          console.log(testArray);
      });
      */
}
testJS();
const port = 3000;
app.listen(port, () => console.log(`Server started on port ${port}`));