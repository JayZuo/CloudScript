///////////////////////////////////////////////////////////////////////////////////////////////////////
//
// Welcome to your first Cloud Script revision!
//
// Cloud Script runs in the PlayFab cloud and has full access to the PlayFab Game Server API 
// (https://api.playfab.com/Documentation/Server), and it runs in the context of a securely
// authenticated player, so you can use it to implement logic for your game that is safe from
// client-side exploits. 
//
// Cloud Script functions can also make web requests to external HTTP
// endpoints, such as a database or private API for your title, which makes them a flexible
// way to integrate with your existing backend systems.
//
// There are several different options for calling Cloud Script functions:
//
// 1) Your game client calls them directly using the "ExecuteCloudScript" API,
// passing in the function name and arguments in the request and receiving the 
// function return result in the response.
// (https://api.playfab.com/Documentation/Client/method/ExecuteCloudScript)
// 
// 2) You create PlayStream event actions that call them when a particular 
// event occurs, passing in the event and associated player profile data.
// (https://api.playfab.com/playstream/docs)
// 
// 3) For titles using the Photon Add-on (https://playfab.com/marketplace/photon/),
// Photon room events trigger webhooks which call corresponding Cloud Script functions.
// 
// The following examples demonstrate all three options.
//
///////////////////////////////////////////////////////////////////////////////////////////////////////


// This is a Cloud Script function. "args" is set to the value of the "FunctionParameter" 
// parameter of the ExecuteCloudScript API.
// (https://api.playfab.com/Documentation/Client/method/ExecuteCloudScript)
// "context" contains additional information when the Cloud Script function is called from a PlayStream action.
handlers.helloWorld = function (args, context) {

    // The pre-defined "currentPlayerId" variable is initialized to the PlayFab ID of the player logged-in on the game client. 
    // Cloud Script handles authenticating the player automatically.
    var message = "Hello " + currentPlayerId + "!";

    // You can use the "log" object to write out debugging statements. It has
    // three functions corresponding to logging level: debug, info, and error. These functions
    // take a message string and an optional object.
    log.info(message);
    var inputValue = null;
    if (args && args.inputValue)
        inputValue = args.inputValue;
    log.debug("helloWorld:", { input: inputValue });

    // The value you return from a Cloud Script function is passed back 
    // to the game client in the ExecuteCloudScript API response, along with any log statements
    // and additional diagnostic information, such as any errors returned by API calls or external HTTP
    // requests. They are also included in the optional player_executed_cloudscript PlayStream event 
    // generated by the function execution.
    // (https://api.playfab.com/playstream/docs/PlayStreamEventModels/player/player_executed_cloudscript)
    return { messageValue: message };
};

// This is a simple example of making a PlayFab server API call
handlers.makeAPICall = function (args, context) {
    var request = {
        PlayFabId: currentPlayerId, Statistics: [{
            StatisticName: "Level",
            Value: 2
        }]
    };
    // The pre-defined "server" object has functions corresponding to each PlayFab server API 
    // (https://api.playfab.com/Documentation/Server). It is automatically 
    // authenticated as your title and handles all communication with 
    // the PlayFab API, so you don't have to write extra code to issue HTTP requests. 
    var playerStatResult = server.UpdatePlayerStatistics(request);
};

// This is a simple example of making a web request to an external HTTP API.
handlers.makeHTTPRequest = function (args, context) {
    var headers = {
        "X-MyCustomHeader": "Some Value"
    };

    var body = {
        input: args,
        userId: currentPlayerId,
        mode: "foobar"
    };

    var url = "https://httpbin.org/post";
    var content = JSON.stringify(body);
    var httpMethod = "post";
    var contentType = "application/json";

    // The pre-defined http object makes synchronous HTTP requests
    var response = http.request(url, httpMethod, content, contentType, headers);
    return { responseContent: response };
};

// This is a simple example of a function that is called from a
// PlayStream event action. (https://playfab.com/introducing-playstream/)
handlers.handlePlayStreamEventAndProfile = function (args, context) {

    // The event that triggered the action 
    // (https://api.playfab.com/playstream/docs/PlayStreamEventModels)
    var psEvent = context.playStreamEvent;

    // The profile data of the player associated with the event
    // (https://api.playfab.com/playstream/docs/PlayStreamProfileModels)
    var profile = context.playerProfile;

    // Post data about the event to an external API
    var content = JSON.stringify({ user: profile.PlayerId, event: psEvent.EventName });
    var response = http.request('https://httpbin.org/status/200', 'post', content, 'application/json', null);

    return { externalAPIResponse: response };
};


// Below are some examples of using Cloud Script in slightly more realistic scenarios

// This is a function that the game client would call whenever a player completes
// a level. It updates a setting in the player's data that only game server
// code can write - it is read-only on the client - and it updates a player
// statistic that can be used for leaderboards. 
//
// A funtion like this could be extended to perform validation on the 
// level completion data to detect cheating. It could also do things like 
// award the player items from the game catalog based on their performance.
handlers.completedLevel = function (args, context) {
    var level = args.levelName;
    var monstersKilled = args.monstersKilled;

    var updateUserDataResult = server.UpdateUserInternalData({
        PlayFabId: currentPlayerId,
        Data: {
            lastLevelCompleted: level
        }
    });

    log.debug("Set lastLevelCompleted for player " + currentPlayerId + " to " + level);
    var request = {
        PlayFabId: currentPlayerId, Statistics: [{
            StatisticName: "level_monster_kills",
            Value: monstersKilled
        }]
    };
    server.UpdatePlayerStatistics(request);
    log.debug("Updated level_monster_kills stat for player " + currentPlayerId + " to " + monstersKilled);
};


// In addition to the Cloud Script handlers, you can define your own functions and call them from your handlers. 
// This makes it possible to share code between multiple handlers and to improve code organization.
handlers.updatePlayerMove = function (args) {
    var validMove = processPlayerMove(args);
    return { validMove: validMove };
};


// This is a helper function that verifies that the player's move wasn't made
// too quickly following their previous move, according to the rules of the game.
// If the move is valid, then it updates the player's statistics and profile data.
// This function is called from the "UpdatePlayerMove" handler above and also is 
// triggered by the "RoomEventRaised" Photon room event in the Webhook handler
// below. 
//
// For this example, the script defines the cooldown period (playerMoveCooldownInSeconds)
// as 15 seconds. A recommended approach for values like this would be to create them in Title
// Data, so that they can be queries in the script with a call to GetTitleData
// (https://api.playfab.com/Documentation/Server/method/GetTitleData). This would allow you to
// make adjustments to these values over time, without having to edit, test, and roll out an
// updated script.
function processPlayerMove(playerMove) {
    var now = Date.now();
    var playerMoveCooldownInSeconds = 15;

    var playerData = server.GetUserInternalData({
        PlayFabId: currentPlayerId,
        Keys: ["last_move_timestamp"]
    });

    var lastMoveTimestampSetting = playerData.Data["last_move_timestamp"];

    if (lastMoveTimestampSetting) {
        var lastMoveTime = Date.parse(lastMoveTimestampSetting.Value);
        var timeSinceLastMoveInSeconds = (now - lastMoveTime) / 1000;
        log.debug("lastMoveTime: " + lastMoveTime + " now: " + now + " timeSinceLastMoveInSeconds: " + timeSinceLastMoveInSeconds);

        if (timeSinceLastMoveInSeconds < playerMoveCooldownInSeconds) {
            log.error("Invalid move - time since last move: " + timeSinceLastMoveInSeconds + "s less than minimum of " + playerMoveCooldownInSeconds + "s.");
            return false;
        }
    }

    var playerStats = server.GetPlayerStatistics({
        PlayFabId: currentPlayerId
    }).Statistics;
    var movesMade = 0;
    for (var i = 0; i < playerStats.length; i++)
        if (playerStats[i].StatisticName === "")
            movesMade = playerStats[i].Value;
    movesMade += 1;
    var request = {
        PlayFabId: currentPlayerId, Statistics: [{
            StatisticName: "movesMade",
            Value: movesMade
        }]
    };
    server.UpdatePlayerStatistics(request);
    server.UpdateUserInternalData({
        PlayFabId: currentPlayerId,
        Data: {
            last_move_timestamp: new Date(now).toUTCString(),
            last_move: JSON.stringify(playerMove)
        }
    });

    return true;
}

// This is an example of using PlayStream real-time segmentation to trigger
// game logic based on player behavior. (https://playfab.com/introducing-playstream/)
// The function is called when a player_statistic_changed PlayStream event causes a player 
// to enter a segment defined for high skill players. It sets a key value in
// the player's internal data which unlocks some new content for the player.
handlers.unlockHighSkillContent = function (args, context) {
    var playerStatUpdatedEvent = context.playStreamEvent;
    var request = {
        PlayFabId: currentPlayerId,
        Data: {
            "HighSkillContent": "true",
            "XPAtHighSkillUnlock": playerStatUpdatedEvent.StatisticValue.toString()
        }
    };
    var playerInternalData = server.UpdateUserInternalData(request);
    log.info('Unlocked HighSkillContent for ' + context.playerProfile.DisplayName);
    return { profile: context.playerProfile };
};

// Photon Webhooks Integration
//
// The following functions are examples of Photon Cloud Webhook handlers. 
// When you enable the Photon Add-on (https://playfab.com/marketplace/photon/)
// in the Game Manager, your Photon applications are automatically configured
// to authenticate players using their PlayFab accounts and to fire events that 
// trigger your Cloud Script Webhook handlers, if defined. 
// This makes it easier than ever to incorporate multiplayer server logic into your game.


// Triggered automatically when a Photon room is first created
handlers.RoomCreated = function (args) {
    log.debug("Room Created - Game: " + args.GameId + " MaxPlayers: " + args.CreateOptions.MaxPlayers);
};

// Triggered automatically when a player joins a Photon room
handlers.RoomJoined = function (args) {
    log.debug("Room Joined - Game: " + args.GameId + " PlayFabId: " + args.UserId);
};

// Triggered automatically when a player leaves a Photon room
handlers.RoomLeft = function (args) {
    log.debug("Room Left - Game: " + args.GameId + " PlayFabId: " + args.UserId);
};

// Triggered automatically when a Photon room closes
// Note: currentPlayerId is undefined in this function
handlers.RoomClosed = function (args) {
    log.debug("Room Closed - Game: " + args.GameId);
};

// Triggered automatically when a Photon room game property is updated.
// Note: currentPlayerId is undefined in this function
handlers.RoomPropertyUpdated = function (args) {
    log.debug("Room Property Updated - Game: " + args.GameId);
};

// Triggered by calling "OpRaiseEvent" on the Photon client. The "args.Data" property is 
// set to the value of the "customEventContent" HashTable parameter, so you can use
// it to pass in arbitrary data.
handlers.RoomEventRaised = function (args) {
    var eventData = args.Data;
    log.debug("Event Raised - Game: " + args.GameId + " Event Type: " + eventData.eventType);

    switch (eventData.eventType) {
        case "playerMove":
            processPlayerMove(eventData);
            break;

        default:
            break;
    }
};

handlers.GetOthersInv = function (args, ID) {
    log.debug("PlayFabId:" + args.ID);
    var inventory = server.GetUserInventory({ PlayFabId: args.ID });
    log.debug(inventory.PlayFabId + ": Inventory" + inventory.Inventory.length, { Inventory: inventory.Inventory })
    var Mystring = null;
    for (var i = 0; i < inventory.Inventory.length; i++) {
        if (inventory.Inventory[i].ItemClass == "Inventory") {
            Mystring += "#" + inventory.Inventory[i].DisplayName + " x" + inventory.Inventory[i].RemainingUses + "#";
        }
    }
    log.debug("GetOthersInv:" + Mystring);
    return { messageValue: Mystring };
};

handlers.testFBPicUrl = function (args, content) {
    var message = "{\"picture\":{\"data\":{\"height\":50,\"is_silhouette\":false,\"url\":\"https://platform-lookaside.fbsbx.com/platform/profilepic/?asid=10155832140626538&height=50&width=50&ext=1537597911&hash=AeSK7VTnDou3sTUJ\",\"width\":50}},\"id\":\"10155832140626538\"}";

    var payload = JSON.parse(message);
    log.info((((payload || {}).picture || {}).data || {}).url);
    return (((payload || {}).picture || {}).data || {}).url;
}

handlers.createUserDefaultValues = function (args, context) {
    entity.SetObjects(
        {
            Entity: server.GetUserAccountInfo({ PlayFabId: currentPlayerId }).UserInfo.TitleInfo.TitlePlayerAccount,
            Objects: [{
                ObjectName: "Test1",
                DataObject: "Blah"
            },
            {
                ObjectName: "Test2",
                DataObject: [1, 2, 3]
            }
            ]
        });
}

handlers.deletePlayer = function (args, content) {
    server.DeletePlayer({ PlayFabId: args.ID });
}

handlers.getTitleInternalData = function (args, content) {
    var loc = args.key;
    var titleData = server.GetTitleInternalData({ "Keys": loc })
    var campaignData = {};
    var window = "oldlibrary";
    if (titleData.Data.hasOwnProperty(loc)) {
        campaignData = JSON.parse(titleData.Data[loc]);
    }
    log.info(JSON.stringify(campaignData) + "  " + campaignData[window] + " " + campaignData.hasOwnProperty(window));
}

handlers.getPlayerStatistics = function () {
    let myResult = server.GetPlayerStatistics({ PlayFabId: currentPlayerId });
    let s = myResult.Statistics.find(s => s.StatisticName === "XP");
    log.info(s);
    return s.Value;
}

handlers.getPlayerStatisticByName = function (args, context) {
    let result = server.GetPlayerStatistics({ PlayFabId: currentPlayerId, StatisticNames: args.Name });
    log.info(result.Statistics);
    let statistic = result.Statistics[0];
    return statistic.Value;
}

handlers.addMember = function (args, context) {

    let group = { Id: args.GroupId, Type: "group" };
    let entityProfile = context.currentEntity;
    try {
        entity.AddMembers({ Group: group, Members: [entityProfile.Entity] });
    }
    catch (error) {
        log.error(error);
        return false;
    }
    return true;
}

//##### SELECT FREE DRAWING WINNER #####
handlers.SelectFreeDrawingWinner = function (args, context) {
    //Get segment
    var result2 = server.GetPlayersInSegment({
        MaxBatchSize: 10000,
        SegmentId: "F923DAAE46FACAB0"
    });

    if (result2.ProfilesInSegment > 0) {
        result2.PlayerProfiles.forEach(element => {
            log.info("Player in Segment: " + element.PlayerId);
        });
    }
}

// This is a simple example of making a web request to an external HTTP API.
handlers.makeHTTPRequestWithGivenStatusCode = function (args, context) {
    var headers = {
        "X-MyCustomHeader": "Some Value"
    };

    for (const key in args) {
        if (Object.hasOwnProperty.call(args, key)) {
            const element = args[key];
            log.info("Args are: " + element);
        }
    }

    var url = "https://httpbin.org/status/" + args.StatusCode;
    var httpMethod = "get";

    // The pre-defined http object makes synchronous HTTP requests
    try {
        var response = http.request(url, httpMethod, null, null, headers, false);
        return { responseContent: response };
    } catch (error) {
        return { responseError: error };
    }
};

handlers.makeEntityAPICall = function (args, context) {
    // The pre-defined 'entity' object has functions corresponding to each PlayFab Entity API。
    var apiResult = entity.GetFiles({
        Entity: {
            Id: "98CB4E00BAD136D8", //Here we need to use title player Id, not the master player Id (PlayFabId).
            Type: "title_player_account"
        }
    });

    return {
        profile: entityProfile,
        setResult: apiResult.SetResults[0].SetResult
    };
};

handlers.writeEvents = function (args, context) {
    var apiResult = entity.WriteEvents({
        Events: [{
            Entity: {
                Id: "E4EB",
                Type: "title"
            },
            EventNamespace: "com.playfab.events.example",
            Name: "cloudscript_write_events",
            Payload: {
                Foo: "Bar",
                Nums: [
                    1,
                    2,
                    3
                ]
            }
        }
        ]
    })
};

handlers.getProfiles = function (args, context) {
    var result1 = entity.GetProfiles({
        "Entities": [
            {
                "Id": "C7B51708E8CA8B2",
                "Type": "title_player_account"
            },
            {
                "Id": "941E420241209320",
                "Type": "title_player_account"
            },
            {
                "Id": "9678877E74322619",
                "Type": "title_player_account"
            },
            {
                "Id": "903666BF177F1249",
                "Type": "title_player_account"
            },
            {
                "Id": "9C162AFA55DDCFAC",
                "Type": "title_player_account"
            },
            {
                "Id": "CD9956A07C96033C",
                "Type": "title_player_account"
            },
            {
                "Id": "317D927F2B760736",
                "Type": "title_player_account"
            },
            {
                "Id": "F54967068876A18D",
                "Type": "title_player_account"
            },
            {
                "Id": "EC398ABC0820E311",
                "Type": "title_player_account"
            },
            {
                "Id": "4279E48441309A69",
                "Type": "title_player_account"
            },
            {
                "Id": "503E61B8F9521A44",
                "Type": "title_player_account"
            },
            {
                "Id": "8096CD68B32B8756",
                "Type": "title_player_account"
            },
            {
                "Id": "D06874D638E712C5",
                "Type": "title_player_account"
            },
            {
                "Id": "EF07FE53164D4288",
                "Type": "title_player_account"
            },
            {
                "Id": "F5DE5F1B33217F5E",
                "Type": "title_player_account"
            },
            {
                "Id": "E8D3DF2161939495",
                "Type": "title_player_account"
            },
            {
                "Id": "287CBA8F1869C61B",
                "Type": "title_player_account"
            },
            {
                "Id": "BA407DB0307D75F2",
                "Type": "title_player_account"
            },
            {
                "Id": "66E635A67855C579",
                "Type": "title_player_account"
            },
            {
                "Id": "200459321B753F34",
                "Type": "title_player_account"
            },
            {
                "Id": "530CBF5DAF73DCA9",
                "Type": "title_player_account"
            },
            {
                "Id": "60D0692F74C6B4BA",
                "Type": "title_player_account"
            },
            {
                "Id": "81A74A3A131342AA",
                "Type": "title_player_account"
            },
            {
                "Id": "838966890A10B56C",
                "Type": "title_player_account"
            },
            {
                "Id": "BEC3E2141DAC9B51",
                "Type": "title_player_account"
            }
        ]
    });
    log.info(result1.Profiles);
    var result2 = entity.GetProfiles({
        "Entities": [
            {
                "Id": "77CB149A45F8001",
                "Type": "title_player_account"
            }
        ]
    });
    log.info(result2.Profiles);
    return result1.Profiles.concat(result2.Profiles);
}

handlers.listMembership = function (args, context) {
    return entity.ListMembership({
        "Entity": {
            "Id": args.ID,
            "Type": "title_player_account"
        }
    })
}

handlers.listGroupMembership = function (args, context) {
    return group.ListMembership({
        "Entity": {
            "Id": args.ID,
            "Type": "title_player_account"
        }
    })
}

handlers.AddFriendToPlayer = function (args) {
    try {
        server.AddFriend({ PlayFabId: args.playerId, FriendPlayFabId: args.friendId })
    } catch (ex) {
        switch (ex.apiErrorInfo.apiError.errorCode) {
            case 1183: // UsersAlreadyFriends
            case 1133: // ConcurrentEditError
                // if the friend is already in the list or the list is already being modified return false to interrupt the process
                // it can happen when both players invite each other at the same time in which case
                // the first player to add the other will have the priority and will update both of the friends lists
                return false;
            default:
                throw `An error occurred calling AddFriend in execFriendsOp.AddFriendToPlayer (${ex.apiErrorInfo.apiError.errorCode})`
        }
    }
    return true;
}

function sleep(time) {
    return new Promise((resolve) => setTimeout(resolve, time));
}

handlers.TestSleep = function (args) {
    let time = args.time;
    log.info(time);
    setTimeout(function () {
        return time + "later";
    }, time);
}

handlers.logContext = function (args, context) {
    return context;
};
