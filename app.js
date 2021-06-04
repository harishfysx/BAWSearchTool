const express = require('express');
const multer = require('multer');
const ejs = require('ejs');
const path = require('path');
const unzip = require('unzip');
const fs = require('fs');
const extract = require('extract-zip');
const resolve = require('path').resolve;
const xpath = require('xpath');
const xpath2 = require('xpath2');
const findInFiles = require('find-in-files');
const dom = require('xmldom').DOMParser;
const fsPromises = require('fs').promises;
const fsExtra = require('fs-extra');
const bodyParser = require('body-parser');
const exec = require('child_process').exec;
const shell = require('shelljs');
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
    const filetypes = /twx/;
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
        msg: message,
        fileStatus,
        fileNames
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
        msg: message,
        fileStatus,
        fileNames
    })
});
app.post('/upload', (req, res) => {
    var fileStatus = false;;
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
                fileStatus = true;
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
    var fileStatus = true;;
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
        if (testArray.length) {
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
                    } else if (filePath.includes('/12.')) {
                        assetType = "Data"; //
                    }
                    // To Find the locations in attribute names start
                    var nodes = xpath.select(`//@*[contains(., '${req.body.searchTerm}')]`, doc);
                    if (nodes) {
                        for (var i = 0; i < nodes.length; i++) {
                            //console.log("node Names",nodes[i].value);
                            if (!nodes[i].ownerElement.nodeName.includes('ns17:')) {
                                //console.log("nodes[i].ownerElement.nodeName ", nodes[i].ownerElement.nodeName );
                                var location = nodes[i].ownerElement.nodeName;
                                if (nodes[i].ownerElement.nodeName == "processParameter") {
                                    location = "input/output variable";
                                } else if (nodes[i].ownerElement.nodeName == "processVariable") {
                                    location = "private variable";
                                }
                                var attrTag = {
                                    'attributVal': nodes[i].value,
                                    'attrNodeName': location,
                                    'matchedTerm': 'Do it later'
                                };
                                tagLocations.push(attrTag);
                            }
                            //var attrTag = {'attributVal':nodes[i].value, 'attrNodeName': nodes[i].ownerElement.nodeName }
                        }
                        // Find the node
                        // Handle Complext object file which starts with 12
                        var dataProperties = xpath.select(`//teamworks//twClass//definition/property/*[text()[contains(.,'${req.body.searchTerm}')]]`, doc);
                        if (dataProperties) {
                            for (var i = 0; i < dataProperties.length; i++) {
                                var attrTag = {
                                    'attributVal': dataProperties[i].childNodes[0].data,
                                    'attrNodeName': 'property',
                                    'matchedTerm': dataProperties[i].childNodes[0].data
                                };
                                tagLocations.push(attrTag);
                            }
                        }
                        //
                        // To Find the locations in attribute names end for service xml - starting with 1. 
                        //var textNodes = xpath.select(`//teamworks//process/item//*[text()[contains(.,'${req.body.searchTerm}')]]/parent::*/parent::*/name`, doc);
                        //item[ .//*[text()[contains(.,'tw.local.WebServeMonitorConfig.monitorSeq')]]]/name
                        var textNodes = xpath.select(` //item[ .//*[text()[contains(.,'${req.body.searchTerm}')]]]/name`, doc);
                        // To Find the locations in text start
                        if (textNodes.length) {
                            for (var k = 0; k < textNodes.length; k++) {
                                // var keys = Object.keys(textNodes[k].firstChild);
                                //  console.log("##################", keys);(
                                if(matchedObj.objectName == 'TDSH Save Web Service Monitor'){
                                    
                                    var itemNameString = String(textNodes[k].childNodes[0].data);
                                   // console.log("item Name ::: ",itemNameString);
                                   console.log(">>>>>>>>>>>>>>>>>>>>>>",itemNameString,"<<<<<<<<<<<<<<<");
                                    var xpathForExactEle = `//item[name='${textNodes[k].childNodes[0].data}']//*[text()[contains(.,'${req.body.searchTerm}')]]`
                                    //console.log("xpathForExactEle  ::: ",xpathForExactEle);
                                  var exactElementInItem =  xpath.select(xpathForExactEle, doc);
                                  for(var i=0; i<exactElementInItem.length; i++){
                                      var ancestorChain =exactElementInItem[i].nodeName;
                                      var ancestorList = [exactElementInItem[i].nodeName];
                                    console.log("----------------",i);
                                      var matchedNodeName = exactElementInItem[i].nodeName;
                                      var parentNodeEle = exactElementInItem[i].parentNode;
                                      var currentElementName = matchedNodeName;
                                      while(parentNodeEle !=null){
                                          if(parentNodeEle.nodeName == 'item'){
                                              break;
                                          }
                                        //console.log("Parent Of ", currentElementName, "is ", parentNodeEle.nodeName);
                                        ancestorList.push(parentNodeEle.nodeName);
                                        ancestorChain += "<---" + parentNodeEle.nodeName ;
                                        currentElementName = parentNodeEle.nodeName;
                                        parentNodeEle = parentNodeEle.parentNode;
                                      } ;
                                      ancestorList.push(itemNameString);
                                      console.log("ancestorChain", ancestorChain + "<------" +itemNameString);
                                      console.log("ancestorChain", ancestorList.reverse().join('--->'));
                                     
                                    //var keys = Object.keys(exactElementInItem[i]);
                                 
                                  }
                                  
                                //  console.log("exactElementInItem  elemtn data ::: ",exactElementInItem[0].firstChild.data);
                                //var exactEleAncestors = xpath2.select('//item[name= "Copy of Script Task"]//script/ancestor::node()/name()', doc); // working
                                
                                   //var keys = Object.keys(exactElementInItem[0]);
                                    //console.log("##################", keys);

                                }
                                
                                var textScript = xpath.select(`string(//teamworks//process/item[name='${textNodes[k].childNodes[0].data}']/TWComponent/script)`, doc);
                                var tWComponentName = xpath.select(`string(//teamworks//process/item[name='${textNodes[k].childNodes[0].data}']/tWComponentName[1])`, doc);
                                //console.log("$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$tWComponentName",tWComponentName);
                                var splittedLinesArray = textScript.split("\n");
                                var matchedLineNumbers = splittedLinesArray.reduce(function(a, e, i) {
                                    if (e.includes(req.body.searchTerm)) a += i + 1 + " ,"
                                    return a;
                                }, []);
                                var formattedLineNums = '';
                                //console.log("%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%% matchedLineNumbers", matchedLineNumbers);
                                if (typeof matchedLineNumbers === 'string') {
                                    formattedLineNums = matchedLineNumbers.replace(/\,$/, '');
                                }
                                if (k == 0) {
                                    //console.log("%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%% textNodes[k]",textNodes[k]);
                                   // console.log("^^^^^^^^^^^^^^^^^^^^^^^^^^^^^ textScript", matchedLineNumbers);
                                    //console.log("^^^^^^^^^^^^^^^^^^^^^^^^^^^^^ textScript",splittedLinesArray);
                                }
                                //console.log(index+1 );
                                //console.log("%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%% matchedLineNumber",tWComponentName);
                                var attrTag = {
                                    'attributVal': formattedLineNums,
                                    'attrNodeName': tWComponentName + "( " + textNodes[k].childNodes[0].data + ")"
                                };
                                tagLocations.push(attrTag);
                            }
                        }
                        // To Find the locations in text end
                        // To search through coahview xml files starting with 64. start
                        var coachViewNode = xpath.select(`//teamworks//coachView//*[text()[contains(.,'${req.body.searchTerm}')]]`, doc);
                        if (coachViewNode.length) {
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
        } else {
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
const deleteTwxs = async () => {
    try {
        const extractedDir = "./public/extractedFiles";
        const twxDirectory = "./public/uploads";
        await fsExtra.emptyDirSync(extractedDir);
        await fsExtra.emptyDirSync(twxDirectory);
    } catch (err) {
        console.log("errror deleting twx file and its extracted contents");
    }
}

function testJS() {
    console.log("Test file");
    var data = fs.readFileSync('./public/extractedFiles/objects/1.2a3547d2-c48a-495b-93ce-1e8895fbd864.xml', {
        encoding: 'UTF-8'
    });
    // Create an XMLDom Element:
    var doc = new dom().parseFromString(data);
    //var childNodes = xpath.select('/teamworks/process/item', doc);
    var childNodes = xpath2.select('//teamworks//process/item[name= "Exclusive Gateway"]//*[text()[contains(.,"tw.local.WebServeMonitorConfig.monitorSeq")]]/ancestor::*/name()', doc);
    console.log(childNodes);//
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