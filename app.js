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
var fileNames;
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
    var message;
    

    if (fs.readdirSync('./public/uploads').length === 0) {
        fileStatus = false;
        //message = "No TWX is detected. "
        
    } else {
        fileStatus = true;
        fileNames = fs.readdirSync('./public/uploads');
        //message = fileNames + " is detected. "

    }
    res.render('index', {
        msg: message , fileStatus, fileNames
    });
});
app.get('/searchTwx', (req, res) => {
  var fileStatus;
  var message;
  var fileNames;

  if (fs.readdirSync('./public/uploads').length === 0) {
    fileStatus = false;
    message = "No TWX is detected. "
    
} else {
    fileStatus = true;
    fileNames = fs.readdirSync('./public/uploads');
    //message = fileNames + " is detected. "

}

    res.render('searchTwx', {
      msg: message , fileStatus, fileNames
    })
});
app.post('/upload', (req, res) => {
  var fileStatus =false;;
    upload(req, res, (err) => {
        if (err) {
            res.render('index', {
                msg: err,
                fileStatus
            });
        } else {
            if (req.file == undefined) {
                res.render('index', {
                    msg: 'Error: No File Selected!',
                    fileStatus,
                    fileNames
                });
            } else {
              fileStatus =true;
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
   var fileStatus =true;;
    console.log(req.body);
    searchFileString = "grep -nlr " + req.body.searchTerm + " ./public/extractedFiles/objects";
    exec(searchFileString, (error, stdout, stderr) => {
        if (error) {
            console.log("errro message", `error: ${error.message}`);
            res.render('searchTwx', {
              msg: "No serach results for : " + req.body.searchTerm,
              fileStatus,
              fileNames
          })
            return;
        }
        if (stderr) {
            console.log(`stderr: ${stderr}`);
            return;
        }
        //console.log("stdotu",stdout);
        var testArray = stdout.split("\n");
        if(testArray.length){
          var matchedObjectNames = [];
        testArray.forEach(function(filePath, index) {
            if (filePath) {
                //console.log(filePath);
                var matchedObj = {};
                var assetType = '';
                var tagLocations = [];
                var data = fs.readFileSync(filePath, {
                    encoding: 'UTF-8'
                });
                var doc = new dom().parseFromString(data);
                // To Find the Artifact  Names
                matchedObj.objectName = xpath.select('string((//@name)[1])', doc);
                if (filePath.includes('/64.')) {
                    assetType = "CoachView";
                } else if (filePath.includes('/1.')) {
                    assetType = "Service";
                }
                // To Find the locations in attribute names start
                var nodes = xpath.select(`//@*[contains(., '${req.body.searchTerm}')]`, doc);
                if (nodes) {
                    for (var i = 0; i < nodes.length; i++) {
                        // console.log("node Names",nodes[i].value);
                        if (!nodes[i].ownerElement.nodeName.includes('ns17:')) {
                            // console.log("nodes[i].ownerElement.nodeName ", nodes[i].ownerElement.nodeName );
                            var location = nodes[i].ownerElement.nodeName;
                            if (nodes[i].ownerElement.nodeName == "processParameter") {
                                location = "input/output variable";
                            } else if (nodes[i].ownerElement.nodeName == "processVariable") {
                                location = "private variable";
                            }
                            var attrTag = {
                                'attributVal': nodes[i].value,
                                'attrNodeName': location
                            };
                            tagLocations.push(attrTag);
                        }
                        //var attrTag = {'attributVal':nodes[i].value, 'attrNodeName': nodes[i].ownerElement.nodeName }
                    }
                    // To Find the locations in attribute names end for service xml - starting with 1. 
                    var textNodes = xpath.select(`//teamworks//process/item//*[text()[contains(.,'${req.body.searchTerm}')]]/parent::*/parent::*/name`, doc);
                    //var textNodes = xpath.select(`//*[text()[contains(.,'${req.body.searchTerm}')]]/parent::*/parent::*/name`, doc);
                    // To Find the locations in text start
                    if (textNodes.length) {
                        for (var k = 0; k < textNodes.length; k++) {
                          
                           // var keys = Object.keys(textNodes[k].firstChild);
                           //  console.log("##################", keys);
                            //console.log("%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%",textNodes[k].firstChild);
                            var textScript = xpath.select(`string(//teamworks//process/item[name='${textNodes[k].childNodes[0].data}']/TWComponent/script)`, doc);
                            var tWComponentName = xpath.select(`string(//teamworks//process/item[name='${textNodes[k].childNodes[0].data}']/tWComponentName[1])`, doc);
                            //console.log("$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$tWComponentName",tWComponentName);
                           
                            var splittedLinesArray = textScript.split("\n");
                            var matchedLineNumber= splittedLinesArray.findIndex(el => el.includes(req.body.searchTerm)) +1;

                            if(k==0){
                              //console.log("%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%% textNodes[k]",textNodes[k]);
                              //console.log("^^^^^^^^^^^^^^^^^^^^^^^^^^^^^ textScript",matchedLineNumber);
                            }
                          //console.log(index+1 );
                            //console.log("%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%% matchedLineNumber",tWComponentName);
                          
                            var attrTag = {
                                'attributVal': "",
                                'attrNodeName': tWComponentName + ": " +textNodes[k].childNodes[0].data
                                
                            };
                            tagLocations.push(attrTag);
                        }
                    }
                    // To Find the locations in text end
                    // To search through coahview xml files starting with 64. start
                       var coachViewNode = xpath.select(`//teamworks//coachView//*[text()[contains(.,'${req.body.searchTerm}')]]`, doc);
                       if(coachViewNode.length){
                        for (var i = 0; i < coachViewNode.length; i++) {
                          var attrTag = {
                            'attributVal': "",
                            'attrNodeName': coachViewNode[i].nodeName
                            
                        };
                        tagLocations.push(attrTag);
                        }
                       }
                       
                    // To search through coahview xml files starting with 64. end

                }
                matchedObjectNames.push(matchedObj);
                matchedObj['assetType'] = assetType;
                matchedObj['tagLocations'] = tagLocations;
            }
        });
        } else{
          console.log("reslts not found")
        }
        
        // console.log("matchedObjectNames",matchedObjectNames);
        res.render('searchTwx', {
            msg: "serach results for : " + req.body.searchTerm,
            fileStatus: true,
            matchedObjectNames,
            fileNames
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
//testJS();
const port = 3000;
app.listen(port, () => console.log(`Server started on port ${port}`));