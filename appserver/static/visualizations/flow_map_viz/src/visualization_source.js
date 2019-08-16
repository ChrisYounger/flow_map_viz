define([
    'api/SplunkVisualizationBase',
    'api/SplunkVisualizationUtils',
    'jquery',
    'd3'
],
function(
    SplunkVisualizationBase,
    vizUtils,
    $,
    d3
) {
    var vizObj = {
        initialize: function() {
            SplunkVisualizationBase.prototype.initialize.apply(this, arguments);
            var viz = this;
            viz.instance_id = "flow_map_viz-" + Math.round(Math.random() * 1000000);
            viz.instance_id_ctr = 0;
            var theme = 'light'; 
            if (typeof vizUtils.getCurrentTheme === "function") {
                theme = vizUtils.getCurrentTheme();
            }
            viz.$container_wrap = $(viz.el);
            viz.$container_wrap.addClass("flow_map_viz-container");
        },

        formatData: function(data) {
            return data;
        },

        updateView: function(data, config) {
            var viz = this;
            viz.config = {
                maxnodes: "100",
                maxparticles: "100",
                stop_when_not_visible: "yes",
                node_repel_force: "1000",
                node_center_force: "0.01",
                mode: "particles",

                link_speed: "90",
                link_opacity: "0.4",
                link_distance: "200",
                link_width: "1",
                link_color: "#cccccc",
                link_text_size: "10",

                particle_good_color: "#1a9035",
                particle_warn_color: "#d16f18",
                particle_error_color: "#b22b32",
                particle_spread: "5",
                particle_size: "3",
                
                node_width: "150",
                node_height: "80",
                node_bg_color: "#cccccc",
                node_border_color: "#000000",
                node_border_width: "1",
                node_text_color: "#000000",
                node_text_size: "12",
                node_radius: 10,
                node_shadow: "show",

                positions: '',
                
            };
            // Override defaults with selected items from the UI
            for (var opt in config) {
                if (config.hasOwnProperty(opt)) {
                    viz.config[ opt.replace(viz.getPropertyNamespaceInfo().propertyNamespace,'') ] = config[opt];
                }
            }
            
            viz.particleTypes = {
                good:  viz.config.particle_good_color,
                warn:  viz.config.particle_warn_color,
                error: viz.config.particle_error_color,
            };

            viz.data = data;
            viz.scheduleDraw();
        },

        // debounce the draw
        scheduleDraw: function(){
            var viz = this;
            clearTimeout(viz.drawtimeout);
            viz.drawtimeout = setTimeout(function(){
                viz.doDraw();
            }, 300);
        },

        newNode: function(id, opts, order){
            var viz = this;
            if (! viz.nodeDataMap.hasOwnProperty(id)){
                viz.nodeDataMap[id] = {};
                viz.nodeData.push(viz.nodeDataMap[id]);
            }
            // if the node has alraedy been updated this run then dont update it again (i.e. its a loose node)
            if (viz.nodeDataMap[id].drawIteration === viz.drawIteration) {
                return;
            }
            viz.nodeDataMap[id].id = id;
            viz.nodeDataMap[id].drawIteration = viz.drawIteration;
            viz.nodeDataMap[id].order = order;
            viz.nodeDataMap[id].label = opts.hasOwnProperty("label") ? opts.label : id;
            viz.nodeDataMap[id].labelx = opts.hasOwnProperty("labelx") ? opts.labelx : "0";
            viz.nodeDataMap[id].labely = opts.hasOwnProperty("labely") ? opts.labely : "0";
            viz.nodeDataMap[id].height = opts.hasOwnProperty("height") && opts.height !== "" ? Number(opts.height) : Number(viz.config.node_height);
            viz.nodeDataMap[id].width = opts.hasOwnProperty("width") && opts.width !== "" ? Number(opts.width) : Number(viz.config.node_width);
            viz.nodeDataMap[id].color = opts.hasOwnProperty("color") && opts.color !== "" ? opts.color : viz.config.node_bg_color;
            viz.nodeDataMap[id].rx = opts.hasOwnProperty("radius") && opts.radius !== "" ? opts.radius : viz.config.node_radius;
            viz.nodeDataMap[id].opacity = opts.hasOwnProperty("opacity") ? opts.opacity : "";
            viz.nodeDataMap[id].xperc = opts.hasOwnProperty("x") ? opts.x : "";
            viz.nodeDataMap[id].yperc = opts.hasOwnProperty("y") ? opts.y : "";
            viz.nodeDataMap[id].icon = opts.hasOwnProperty("icon") ? opts.icon : "";
            viz.nodeDataMap[id].radius = Math.min(viz.nodeDataMap[id].height/2, viz.nodeDataMap[id].width/2);
        },

        newLink: function(opts){
            var viz = this;
            var id = opts.from + "---" + opts.to;
            if (! viz.linkDataMap.hasOwnProperty(id)){
                viz.linkDataMap[id] = {
                    timeouts: {},
                    intervals: {},
                };
                viz.linkData.push(viz.linkDataMap[id]);
            }
            viz.linkDataMap[id].id = id;
            viz.linkDataMap[id].drawIteration = viz.drawIteration;
            viz.linkDataMap[id].source = opts.from;
            viz.linkDataMap[id].target = opts.to;
            viz.linkDataMap[id].good = opts.hasOwnProperty("good") ? Number(opts.good) : 0;
            viz.linkDataMap[id].warn = opts.hasOwnProperty("warn") ? Number(opts.warn) : 0;
            viz.linkDataMap[id].error = opts.hasOwnProperty("error") ? Number(opts.error) : 0;
            viz.linkDataMap[id].color = opts.hasOwnProperty("color") ? opts.color : viz.config.link_color;
            viz.linkDataMap[id].width = opts.hasOwnProperty("width") ? opts.width : viz.config.link_width;
            viz.linkDataMap[id].distance = opts.hasOwnProperty("distance") ? opts.distance : viz.config.link_distance;
            viz.linkDataMap[id].speed = opts.hasOwnProperty("speed") ? opts.speed : viz.config.link_speed;
            var defaultLabel = (opts.hasOwnProperty("good") && opts.good !== "" ? "Good: " + opts.good : " ") + 
                (opts.hasOwnProperty("warn") && opts.warn !== "" ? "Warn: " + opts.warn : " ") + 
                (opts.hasOwnProperty("error") && opts.error !== "" ? "Error: " + opts.error : "");
            viz.linkDataMap[id].tooltip = opts.hasOwnProperty("tooltip") && opts.tooltip !== "" ? opts.tooltip : defaultLabel;
            viz.linkDataMap[id].label = opts.hasOwnProperty("label") && opts.label !== "" ? opts.label : defaultLabel;
            viz.linkDataMap[id].labeloffset = opts.hasOwnProperty("labeloffset") && opts.labeloffset !== "" ? opts.labeloffset : "50";
        },

        // Add hander for dragging. Anything dragged will get a fixed position
        drag: function(simulation) {
            var viz = this;
            return d3.drag()
                .on("start", function(d) {
                    viz.particleGroup.selectAll("circle").remove();
                    viz.isDragging = true;
                    if (!d3.event.active) simulation.alphaTarget(0.3).restart();
                    d.fx = d.x;
                    d.fy = d.y;
                })
                .on("drag", function(d) {
                    d.fx = d3.event.x;
                    d.fy = d3.event.y;
                })
                .on("end", function(d) {
                    viz.isDragging = false;
                    clearTimeout(viz.startParticlesTimeout);
                    viz.startParticlesTimeout = setTimeout(function(){
                        // do all particles again
                        viz.startParticles();
                    }, viz.delayUntilParticles);
                    if (!d3.event.active) simulation.alphaTarget(0);
                    viz.positionsButton.css("opacity",1);
                    clearTimeout(viz.positionsButtonTimeout);
                    viz.positionsButtonTimeout = setTimeout(function(){
                        viz.positionsButton.css("opacity",0);
                    }, 10000);
                });
        },

        copyTextToClipboard: function(text) {
            var viz = this;
            if (!navigator.clipboard) {
                viz.fallbackCopyTextToClipboard(text);
                return;
            }
            navigator.clipboard.writeText(text).then(function () {
                viz.toast('Copied to clipboard! (now paste into settings)');
            }, function (err) {
                console.error('Async: Could not copy text: ', err);
            });
        },

        fallbackCopyTextToClipboard: function(text) {
            var viz = this;
            var textArea = document.createElement("textarea");
            textArea.value = text;
            document.body.appendChild(textArea);
            textArea.focus();
            textArea.select();
            try {
                var successful = document.execCommand('copy');
                viz.toast('Copied to clipboard! (now paste into settings)');
            } catch (err) {
                console.error('Fallback: Oops, unable to copy', err);
            }
            document.body.removeChild(textArea);
        },

        // Toast popup message
        toast: function(message) {
            var t = $("<div style='background-color: #53a051; width: 432px;  height: 60px; position: fixed; top: 100px; margin-left: -116px;  left: 50%; line-height: 60px; padding: 0 20px; box-shadow: 0 10px 20px rgba(0,0,0,0.19), 0 6px 6px rgba(0,0,0,0.23); color: white; opacity: 0; transform: translateY(30px); text-align: center; transition: all 300ms;'><span></span></div>");
            t.appendTo("body").find('span').text(message);
            setTimeout(function(){
                t.css({'opacity': 1, 'transform': 'translateY(0)'});
                setTimeout(function(){
                    t.css({'opacity': 0, 'transform': 'translateY(30px)'});
                    setTimeout(function(){
                        t.remove();
                    },300);
                },3000);
            },10);
        },

        // Write the current position of elements to the console
        dumpPositions: function(){
            var viz = this;
            viz.nodePos = {};
            for (var i = 0; i < viz.nodeData.length; i++){
                var d = viz.nodeData[i];
                // TODO does this work or need to store fx/fy
                viz.nodePos[d.id] = "" + Math.round(d.x / viz.config.containerWidth * 100) + "," + Math.round(d.y / viz.config.containerHeight * 100);
                if (i === viz.nodeData.length - 1){
                    var dump = JSON.stringify(viz.nodePos);
                    console.log(dump.substr(1,dump.length-2));
                    viz.copyTextToClipboard(dump.substr(1,dump.length-2));
                }
            }
        },

        // set the inital positions of nodes. JSON structure takes precedence, then the data, otherwise center
        loadPositions: function(){
            var viz = this;
            var xy;
            if (! viz.hasOwnProperty("positions") || viz.drawIteration === 1) {
                viz.positions = {};
                if (viz.config.positions !== "") {
                    try {
                        viz.positions = JSON.parse("{" + viz.config.positions + "}");
                    } catch (e) {
                        console.log("Unable to load initial positioning as it isnt a valid JSON array");
                    }
                }
            }
            for (var i = 0; i < viz.nodeData.length; i++){
                // If the dashboard has updated the fx might already be set
                if (! viz.nodeData[i].hasOwnProperty("isPositioned")) {
                    viz.nodeData[i].isPositioned = true;
                    // Data xperc/yperc will be overridden by formatter option
                    if (viz.positions.hasOwnProperty(viz.nodeData[i].id)) {
                        xy = viz.positions[viz.nodeData[i].id].split(",");
                        viz.nodeData[i].xperc = xy[0];
                        viz.nodeData[i].yperc = xy[1];
                    } 
                    if (viz.nodeData[i].xperc !== "") {
                        // .fx sets a fixed x position
                        viz.nodeData[i].fx = viz.nodeData[i].xperc / 100 * viz.config.containerWidth;
                        //viz.nodeData[i].x = viz.nodeData[i].fx;
                    } else {
                        // set a default xposition that will be affected by forces
                        viz.nodeData[i].x = viz.config.containerWidth / 2;
                        //console.log("setting default positoin to ", viz.nodeData[i].x);
                    }
                    if (viz.nodeData[i].yperc !== "") {
                        viz.nodeData[i].fy = viz.nodeData[i].yperc / 100 * viz.config.containerHeight;
                        //viz.nodeData[i].y = viz.nodeData[i].fy;
                    } else {
                        viz.nodeData[i].y = viz.config.containerHeight / 2;
                        //console.log("setting default y positoin to ", viz.nodeData[i].y);
                    }
                }
            }
        },

        startParticles: function() {
            var viz = this;
            if (viz.particleMultiplier === 0) {
                return;
            }
            // TODO convert to normal d3 function calls?
            for (var i = 0; i < viz.linkData.length; i++) {
                if (viz.config.mode === "particles") {
                    for (var particletype in viz.particleTypes) {
                        if (viz.particleTypes.hasOwnProperty(particletype)) {
                            viz.startParticleGroup(viz.linkData[i], particletype);
                        }
                    }
                }
            }
        },

        // Create circle particle creator, 
        // Each link can have three of these for good/warn/error particles
        startParticleGroup: function(link_details, particletype) {
            var viz = this;
            // Stop any existing timers
            clearTimeout(link_details.timeouts[particletype]);
            clearInterval(link_details.intervals[particletype]);
            if (link_details[particletype] <= 0) {
                //console.log("no particles for : ", link_details, particletype);
                return;
            }
            // calculate distance between two points
            var distance = Math.sqrt(Math.pow((link_details.target.fx || link_details.target.x) - (link_details.source.fx || link_details.source.x), 2) + 
                                     Math.pow((link_details.target.fy || link_details.target.y) - (link_details.source.fy || link_details.source.y), 2));
            // Line is too short to animate anything meaningful
            if (distance < (link_details.source.radius + link_details.target.radius)) {
                //console.log("line is too short to animate: ", link_details, distance);
                return;
            } 
            // The duration needs to also consider the length of the line (ms per pixel)
            var base_time = distance * (101 - Math.max(1, Math.min(100, Number(link_details.speed))));
            // add some jitter to the starting position
            var base_jitter = (Number(viz.config.particle_spread) < 0 ? link_details.width : viz.config.particle_spread);
            base_jitter = Number(base_jitter);
            var particle_dispatch_delay = (1000 / (link_details[particletype] * viz.particleMultiplier));
            //console.log("particle_dispatch_delay is", particle_dispatch_delay);
            // randomise the time until the first particle, otherwise multiple nodes will move in step which doesnt look as good
            link_details.timeouts[particletype] = setTimeout(function(){
                viz.doParticle(link_details, particletype, base_time, base_jitter);
                // Start an ongoing timer for this particle
                link_details.intervals[particletype] = setInterval(function(){
                    viz.doParticle(link_details, particletype, base_time, base_jitter);
                }, particle_dispatch_delay);
            }, (Math.random() * particle_dispatch_delay));
        },

        // Creates the actual particle, transition it with random speed and destroy it.
        doParticle: function(link_details, particletype, base_time, base_jitter){
            var viz = this;
            // Do not start particles until stuff slows its movement
            if (viz.isDragging) { return; }
            // if browser window isnt visible then dont draw
            if (viz.config.stop_when_not_visible === "yes" && "visibilityState" in document && document.visibilityState !== 'visible') {
                return;
            }
            var jitter = (base_jitter * Math.random()) - (base_jitter / 2);
            viz.particleGroup.append("circle")
                .attr("cx", (jitter + link_details.source.x))
                .attr("cy", (jitter + link_details.source.y))
                .attr("r", viz.config.particle_size)
                .attr("fill", viz.particleTypes[particletype])
                .transition()
                    // Randomise the speed of the particles
                    .duration(base_time + ((Math.random() * base_time * 0.4) - base_time * 0.2))
                    .ease(d3.easeLinear)
                    .attr("cx", (jitter + link_details.target.x)).attr("cy", (jitter + link_details.target.y))
                    .remove();
        },

        removeParticles: function(link_details) {
            var viz = this;
            for (var particletype in viz.particleTypes) {
                if (viz.particleTypes.hasOwnProperty(particletype)) {
                    clearTimeout(link_details.timeouts[particletype]);
                    clearInterval(link_details.intervals[particletype]);
                }
            }
        },

        doRemove: function(){
            var viz = this;
            delete viz.drawIteration;
            if (viz.hasOwnProperty("linkData")) {
                for (var i = 0; i < viz.linkData.length; i++) {
                    viz.removeParticles(viz.linkData[i]);
                }
            }
        },

        doDraw: function() {
            var viz = this;
            var invalidRows = 0;
            var nodeOrder = 1;
            var nodesLoose = {};

            // Dont draw unless this is a real element under body
            if (! viz.$container_wrap.parents().is("body")) {
                return;
            }
            if (viz.$container_wrap.height() <= 0) {
                return;
            }

            // Keep track of the container size the config used so we know if we need to redraw the whole page
            viz.config.containerHeight = viz.$container_wrap.height();
            viz.config.containerWidth = viz.$container_wrap.width();
            var serialised = JSON.stringify(viz.config);
            if (viz.alreadyDrawn !== serialised) {
                console.log("conf changed", serialised, viz.alreadyDrawn);
                viz.doRemove();
                viz.alreadyDrawn = serialised;
            }

            if (! viz.hasOwnProperty("drawIteration") || ! viz.hasOwnProperty("svg")) {
                viz.drawIteration = 0;
            }
            viz.drawIteration++;
            if (viz.drawIteration === 1) {
                viz.nodeDataMap = {};
                viz.linkDataMap = {};
                viz.nodeData = [];
                viz.linkData = [];
                viz.delayUntilParticles = 2000;
                viz.isDragging = false;
            }

            // loop through data
            for (var l = 0; l < viz.data.results.length; l++) {
                // If it has "from" and "to" its a link (edge)
                if (viz.data.results[l].hasOwnProperty("from") && viz.data.results[l].hasOwnProperty("to") && viz.data.results[l].from !== "" && viz.data.results[l].to !== "") {
                    nodesLoose[viz.data.results[l].from] = nodeOrder++;
                    nodesLoose[viz.data.results[l].to] = nodeOrder++;
                    viz.newLink(viz.data.results[l]);
                // If it doesnt have a "from" and a "to" but it has a "node" then its a node row
                } else if (viz.data.results[l].hasOwnProperty("node") && viz.data.results[l].node !== "") {
                    viz.newNode(viz.data.results[l].node, viz.data.results[l], nodeOrder++);
                } else {
                    invalidRows++;
                }
            }

            // make sure we create any nodes that havent been explicity defined, but that are used for links
            for (var loosenode in nodesLoose) {
                if (nodesLoose.hasOwnProperty(loosenode)){
                    viz.newNode(loosenode, {}, nodesLoose[loosenode]);
                }
            }

            // Determine what nodes are to be removed
            for (var j = viz.nodeData.length - 1; j >= 0 ; j--){
                if (viz.drawIteration !== viz.nodeData[j].drawIteration) {
                    delete viz.nodeDataMap[viz.nodeData[j].id];
                    viz.nodeData.splice(j, 1);
                }
            }

            // count how many particles there are in total
            viz.totalParticles = 0;
            for (var k = viz.linkData.length - 1; k >= 0 ; k--) {
                viz.totalParticles = viz.linkData[k].good + viz.linkData[k].warn + viz.linkData[k].error;
                if (viz.drawIteration !== viz.linkData[k].drawIteration) {
                    // link has been removed, stop particles 
                    viz.removeParticles(viz.linkData[k]);
                    delete viz.linkDataMap[viz.linkData[k].id];
                    viz.linkData.splice(k, 1);
                }
            }

            viz.particleMax = viz.config.maxparticles / 300;
            // If zero, hide all particles
            if (viz.particleMax === 0 || viz.totalParticles === 0) {
                viz.particleMultiplier = 0;
            // If less than zero, we use what is the data. This could cause a browser crash if the user doesnt know what they are doing.
            } else if (viz.particleMax < 0) {
                viz.particleMultiplier = 1;
            } else {
                viz.particleMultiplier = viz.particleMax / viz.totalParticles;
            }

            // Sort the lists back into the order it arrived
            viz.nodeData.sort(function(a,b){
                return a.order - b.order;
            });

            if (invalidRows > 0) {
                console.log("Rows skipped because missing mandatory field: ", invalidRows);
            }

            // Data is missing a mandatory columns 
            if (viz.nodeData.length ===  0 && invalidRows > 0) {
                viz.doRemove();
                viz.$container_wrap.empty().append("<div class='flow_map_viz-bad_data'>Data is missing a mandatory columns ('from', 'to')</div>");
                return;
            }

            // Too many nodes in data
            if (viz.nodeData.length > Number(viz.config.maxnodes)) {
                viz.doRemove();
                viz.$container_wrap.empty().append("<div class='flow_map_viz-bad_data'>Too many nodes in data (Total nodes:" + viz.nodeData.length + ", Limit: " + viz.config.maxnodes + "). </div>");
                return;
            }

            // Add SVG to the page
            if (viz.drawIteration === 1) {
                // TODO do a we need a margin around our item? (if so need to set width/height smaller)
                viz.svg = d3.create("svg").style("box-sizing", "border-box").attr("viewBox", [0, 0, viz.config.containerWidth, viz.config.containerHeight]);
                viz.svg.attr("width", viz.config.containerWidth + "px").attr("height", viz.config.containerHeight + "px");
                viz.$container_wrap.empty().append(viz.svg.node());
                // Add the drop shadow with IE11 and edge support
                viz.shadow_id = viz.instance_id + "_" + (viz.instance_id_ctr++);
                // This doesnt work in IE11 and Edge: https://developer.microsoft.com/en-us/microsoft-edge/platform/issues/18760697/
                //var filter = svg.append("filter").attr("id", shadow_id).append("feDropShadow").attr("flood-opacity", viz.config.shadow === "show" ? 0.3 : 0).attr("dx", 0).attr("dy", 1);
                var defs = viz.svg.append("defs");
                // height=120% so that the shadow is not clipped
                var filter = defs.append("filter").attr("id", viz.shadow_id).attr("height", "120%");
                // From: http://bl.ocks.org/cpbotha/raw/5200394/dropshadow.js with tweaks.
                filter.append("feGaussianBlur").attr("in", "SourceAlpha").attr("stdDeviation", 2).attr("result", viz.shadow_id + "A");
                filter.append("feColorMatrix").attr("in", viz.shadow_id + "A").attr("type","matrix").attr("values", "0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 " + (viz.config.node_shadow === "show" ? 0.35 : 0) + " 0").attr("result", viz.shadow_id + "B");
                filter.append("feOffset").attr("in", viz.shadow_id + "B").attr("dx", 0).attr("dy", 1).attr("result", viz.shadow_id + "C");
                var feMerge = filter.append("feMerge");
                feMerge.append("feMergeNode").attr("in", viz.shadow_id + "C");
                feMerge.append("feMergeNode").attr("in", "SourceGraphic");

                // Add groups in the correct order for layering
                viz.linkGroup = viz.svg.append("g")
                    .attr("stroke-opacity", viz.config.link_opacity)
                    .attr("class", "flow_map_viz-links");
                viz.particleGroup = viz.svg.append("g")
                    .attr("class", "flow_map_viz-particles");
                viz.linkLabelGroup = viz.svg.append("g");
                    //.attr("stroke", "white")
                    //.attr("stroke-width", "4px")
                    //.attr("stroke-opacity", 0.8)               
                viz.nodeGroup = viz.svg.append("g")
                    .attr("class", "flow_map_viz-nodes");

                // Add a button that allows copying the current positions to the clipboard
                viz.positionsButton = $("<span class='flow_map_viz-copylink'><i class='far fa-clipboard'></i> Copy positions to clipboard</span>")
                    .appendTo(viz.$container_wrap)
                    .on("click", function(){
                        viz.dumpPositions();
                    }).on("mouseover",function(){
                        viz.positionsButton.css({"opacity": "1"});
                    }).on("mouseout", function(){
                        clearTimeout(viz.positionsButtonTimeout);
                        viz.positionsButtonTimeout = setTimeout(function(){
                            viz.positionsButton.css("opacity",0);
                        }, 5000);
                    });

                // Apply forces
                // These are the forces that move to the center
                var forceLink = d3.forceLink(viz.linkData).id(function(d) { return d.id; }).distance(function(d) { 
                    return Number(d.distance) + d.source.radius + d.target.radius;
                });//.strength(1);
                var forceCharge = d3.forceManyBody().strength(Number(viz.config.node_repel_force) * -1);
                var forceX = d3.forceX(viz.config.containerWidth / 2).strength(Number(viz.config.node_center_force));
                var forceY = d3.forceY(viz.config.containerHeight / 2).strength(Number(viz.config.node_center_force));

                // Force testing playground: https://bl.ocks.org/steveharoz/8c3e2524079a8c440df60c1ab72b5d03
                viz.simulation = d3.forceSimulation(viz.nodeData)
                    .force("link", forceLink)
                    .force("charge", forceCharge)
                    .force('x', forceX)
                    .force('y',  forceY)
                    //.alphaTarget(1)
                    .on("tick", function() {
                        // When stuff is dragged, or when the forces are being simulated, move items
                        viz.nodeSelection
                            .attr("transform", function(d) {
                                // Prevent stuff going outside view. d.x and d.y are midpoints so stuff can still half go outside the canvas
                                if (isNaN(d.width)) {console.log("there is no d.width on tick", d); }
                                d.x = Math.max(d.radius, Math.min(viz.config.containerWidth - d.radius, d.x));
                                d.y = Math.max(d.radius, Math.min(viz.config.containerHeight - d.radius, d.y));
                                //d.x = Math.max(0, Math.min(viz.config.containerWidth, d.x));
                                //d.y = Math.max(0, Math.min(viz.config.containerHeight, d.y));
                                return "translate(" + (d.x - d.width / 2) + "," + (d.y - d.height / 2) + ")";
                            });
                        viz.linkSelection
                            .attr("x1", function(d){ if (isNaN(d.source.x)) { console.log("there is no d.source.x on tick", JSON.stringify(d)); }return d.source.x || 0; })
                            .attr("y1", function(d){ return d.source.y || 0; })
                            .attr("x2", function(d){ return d.target.x || 0; })
                            .attr("y2", function(d){ return d.target.y || 0; }); 
                        
                        viz.linkLabelSelection
                            .attr("transform", function(d) {
                                var minx = Math.min(d.source.x, d.target.x);
                                var maxx = Math.max(d.source.x, d.target.x);
                                var miny = Math.min(d.source.y, d.target.y);
                                var maxy = Math.max(d.source.y, d.target.y); 
                                //console.log(JSON.stringify(d));
                                return "translate(" + ((maxx - minx) * (d.labeloffset / 100) + minx) + "," + ((maxy - miny) * (d.labeloffset / 100) + miny - (viz.config.link_text_size * 0.3)) + ")";
                            });   
                    });
            }

            viz.loadPositions();
            // Stop the simulation while stuff is added/removed
            viz.simulation.alphaTarget(0);

            // Add the node group element to the page
            viz.nodeSelection = viz.nodeGroup
                .selectAll("g")
                .data(viz.nodeData, function(d){ return d.id; });

            viz.nodeSelection.exit()
                .remove()
                .call(function(selection){
                    //console.log("node removed: ", JSON.stringify(selection));
                });

            viz.nodeSelection.enter()
                .append('g')
                .attr("class", "flow_map_viz-nodeset")
                .attr("transform", function(d) { return "translate(" + (d.x - d.width / 2) + "," + (d.y - d.height / 2) + ")"; })
                .attr("x", function(d){ return d.x; })
                .attr("y", function(d){ return d.y; })
                .on("dblclick", function(d){ 
                    // Remove fixed position on double click
                    d.fx = null;
                    d.fy = null;
                })
                .call(function(selection){
                    //console.log("node added: ", JSON.stringify(selection));
                    selection.filter(function(d){ return d.hasOwnProperty("icon") && d.icon !== ""; })
                        .append("text")
                        .attr("class", "flow_map_viz-nodeicon")
                        .attr("stroke", viz.config.node_border_color)
                        .attr("stroke-width", viz.config.node_border_width);
                    selection.filter(function(d){ return !(d.hasOwnProperty("icon") && d.icon !== ""); })
                        .append("rect")
                        .attr("stroke", viz.config.node_border_color)
                        .attr("stroke-width", viz.config.node_border_width);
                    selection.append("text")
                        .attr("class", "flow_map_viz-nodelabel");
                    selection.append("title")
                        .text(function(d) { return d.label + ((d.label !== d.id) ? " (" + d.id + ")" : ""); });
                })
                .call(viz.drag(viz.simulation));

            // Reselect everything
            viz.nodeSelection = viz.nodeGroup
                .selectAll("g");

            // icon types - setup as font awesome icons
            //viz.nodeSelection.merge(nodeSelectionEnter).filter(function(d){ return d.hasOwnProperty("icon") && d.icon !== ""; })
            viz.nodeSelection.filter(function(d){ return d.hasOwnProperty("icon") && d.icon !== ""; })
                .select(".flow_map_viz-nodeicon")
                .attr("class", "fas")
                .style('text-anchor', 'middle')
                .style('font-size', function(d){ return d.radius * 1.5 + "px"; })
                .attr("x", function(d){ return d.width / 2; })
                .attr("y", function(d){ return d.height / 2 + d.radius / 2; } )
                .text(function(d){ return viz.fontAwesomeMap.hasOwnProperty(d.icon) ? viz.fontAwesomeMap[d.icon] : d.icon; })
                .attr("fill", function(d){ return d.color; })
                .attr("filter", "url(#" + viz.shadow_id + ")")
                .style("opacity", function(d){ return d.opacity; });

            // non-icons - should be rects (can be circles too with the right rx)
            //viz.nodeSelection.merge(nodeSelectionEnter).filter(function(d){ return !(d.hasOwnProperty("icon") && d.icon !== ""); })
            viz.nodeSelection.filter(function(d){ return !(d.hasOwnProperty("icon") && d.icon !== ""); })
                .select("rect")
                .attr("width", function(d){ return d.width; })
                .attr("height", function(d){ return d.height; })
                .attr("rx", function(d){ return d.rx; })
                .attr("fill", function(d){ return d.color; })
                .attr("filter", "url(#" + viz.shadow_id + ")")
                .style("opacity", function(d){ return d.opacity; });

            // add the text label to the icon/rect
            //viz.nodeSelection.merge(nodeSelectionEnter)
            viz.nodeSelection
                .select(".flow_map_viz-nodelabel")
                .text(function(d) { return d.label; })
                .attr("x", function(d){ return d.width / 2 + Number(d.labelx); })
                .attr("y", function(d){ return (d.height / 2) + (viz.config.node_text_size * 0.3) + Number(d.labely); })
                .style("font", viz.config.node_text_size + "px sans-serif")
                .style("text-anchor", "middle")
                .attr("fill", viz.config.node_text_color);

            // Create the links (edges) as d3 objects
            viz.linkSelection = viz.linkGroup
                .selectAll("line")
                .data(viz.linkData, function(d){ return d.id; });
// TODO does join do the same as this?
            viz.linkSelection.enter().append("line");
            viz.linkSelection.exit().remove();
            // reselect lines
            viz.linkSelection = viz.linkGroup
                .selectAll("line")
                    .attr("stroke", function(d){ return d.color; })
                    .attr("stroke-width", function(d){ return d.width; });
            
            if (viz.config.mode === "ants") {
                viz.linkSelection
                    .attr("stroke-linecap", "butt")
                    .attr("stroke-dashoffset", function(d){ return d.width * 5; })
                    .attr("stroke-dasharray", function(d){ return (d.width * 3) + " " + (d.width * 2); })
                    .call(antAnimate);
            }

            function antAnimate(path) {

                // TODO need to stop/update on change
                path.filter(function(d){ return Number(d.speed) !== 0; })
                    .transition()
                    .duration(function(d){ return 100 * (101 - Math.max(1, Math.min(100, Number(d.speed)))); })
                    .ease(d3.easeLinear)
                    .attr("stroke-dashoffset", "0")
                    .on("end", function() { 
                        d3.select(this)
                            .attr("stroke-dashoffset", function(d) { return (d.width * 5); })
                            .call(antAnimate);
                    });
            }



            // Link labels
            viz.linkLabelSelection = viz.linkLabelGroup
                .selectAll("g")
                .data(viz.linkData, function(d){ return d.id; });
            viz.linkLabelSelection.enter()
                .append("g")
                .attr("class", "flow_map_viz-linklabel")
                .call(function(selection){
                    selection.append("text")
                        .style("text-anchor", "middle");
                    selection.append("title");
            });
            viz.linkLabelSelection.exit().remove();

            // reselect link labels
            viz.linkLabelSelection = viz.linkLabelGroup
                .selectAll("g");

            viz.linkLabelSelection
                .select("text")
                .style("font", viz.config.link_text_size + "px sans-serif")
.selectAll("tspan.text")
    .data(function(d) { return d.label.split("|"); })
    .join("tspan")
    .text(function(d) { return d; })
    .attr("x", 0)
    .attr("y", function(d,i){ return i * viz.config.link_text_size * 1.2; })
    //.attr("dx", 0)
    //.attr("dy", "1.2em")
    ;                
    //            .text(function(d) { return d.label; });
            viz.linkLabelSelection.select("title")
                .text(function(d) { return d.tooltip; });

            clearTimeout(viz.startParticlesTimeout);
            viz.startParticlesTimeout = setTimeout(function(){
                // do all particles again
                viz.startParticles();
            }, viz.delayUntilParticles);

            if (viz.drawIteration > 1) {
                // Update and restart the force simulation.
                viz.simulation.nodes(viz.nodeData);
                viz.simulation.force("link").links(viz.linkData);
                viz.simulation.alpha(0.3).restart();
            }
        },

        // Override to respond to re-sizing events
        reflow: function() {
            this.scheduleDraw();
        },

        // Search data params
        getInitialDataParams: function() {
            return ({
                outputMode: SplunkVisualizationBase.RAW_OUTPUT_MODE,
                count: 10000
            });
        },

        fontAwesomeMap: {
            "500px":"\uf26e",
            "accessible-icon":"\uf368",
            "accusoft":"\uf369",
            "acquisitions-incorporated":"\uf6af",
            "ad":"\uf641",
            "address-book":"\uf2b9",
            "address-card":"\uf2bb",
            "adjust":"\uf042",
            "adn":"\uf170",
            "adobe":"\uf778",
            "adversal":"\uf36a",
            "affiliatetheme":"\uf36b",
            "air-freshener":"\uf5d0",
            "airbnb":"\uf834",
            "algolia":"\uf36c",
            "align-center":"\uf037",
            "align-justify":"\uf039",
            "align-left":"\uf036",
            "align-right":"\uf038",
            "alipay":"\uf642",
            "allergies":"\uf461",
            "amazon":"\uf270",
            "amazon-pay":"\uf42c",
            "ambulance":"\uf0f9",
            "american-sign-language-interpreting":"\uf2a3",
            "amilia":"\uf36d",
            "anchor":"\uf13d",
            "android":"\uf17b",
            "angellist":"\uf209",
            "angle-double-down":"\uf103",
            "angle-double-left":"\uf100",
            "angle-double-right":"\uf101",
            "angle-double-up":"\uf102",
            "angle-down":"\uf107",
            "angle-left":"\uf104",
            "angle-right":"\uf105",
            "angle-up":"\uf106",
            "angry":"\uf556",
            "angrycreative":"\uf36e",
            "angular":"\uf420",
            "ankh":"\uf644",
            "app-store":"\uf36f",
            "app-store-ios":"\uf370",
            "apper":"\uf371",
            "apple":"\uf179",
            "apple-alt":"\uf5d1",
            "apple-pay":"\uf415",
            "archive":"\uf187",
            "archway":"\uf557",
            "arrow-alt-circle-down":"\uf358",
            "arrow-alt-circle-left":"\uf359",
            "arrow-alt-circle-right":"\uf35a",
            "arrow-alt-circle-up":"\uf35b",
            "arrow-circle-down":"\uf0ab",
            "arrow-circle-left":"\uf0a8",
            "arrow-circle-right":"\uf0a9",
            "arrow-circle-up":"\uf0aa",
            "arrow-down":"\uf063",
            "arrow-left":"\uf060",
            "arrow-right":"\uf061",
            "arrow-up":"\uf062",
            "arrows-alt":"\uf0b2",
            "arrows-alt-h":"\uf337",
            "arrows-alt-v":"\uf338",
            "artstation":"\uf77a",
            "assistive-listening-systems":"\uf2a2",
            "asterisk":"\uf069",
            "asymmetrik":"\uf372",
            "at":"\uf1fa",
            "atlas":"\uf558",
            "atlassian":"\uf77b",
            "atom":"\uf5d2",
            "audible":"\uf373",
            "audio-description":"\uf29e",
            "autoprefixer":"\uf41c",
            "avianex":"\uf374",
            "aviato":"\uf421",
            "award":"\uf559",
            "aws":"\uf375",
            "baby":"\uf77c",
            "baby-carriage":"\uf77d",
            "backspace":"\uf55a",
            "backward":"\uf04a",
            "bacon":"\uf7e5",
            "balance-scale":"\uf24e",
            "balance-scale-left":"\uf515",
            "balance-scale-right":"\uf516",
            "ban":"\uf05e",
            "band-aid":"\uf462",
            "bandcamp":"\uf2d5",
            "barcode":"\uf02a",
            "bars":"\uf0c9",
            "baseball-ball":"\uf433",
            "basketball-ball":"\uf434",
            "bath":"\uf2cd",
            "battery-empty":"\uf244",
            "battery-full":"\uf240",
            "battery-half":"\uf242",
            "battery-quarter":"\uf243",
            "battery-three-quarters":"\uf241",
            "battle-net":"\uf835",
            "bed":"\uf236",
            "beer":"\uf0fc",
            "behance":"\uf1b4",
            "behance-square":"\uf1b5",
            "bell":"\uf0f3",
            "bell-slash":"\uf1f6",
            "bezier-curve":"\uf55b",
            "bible":"\uf647",
            "bicycle":"\uf206",
            "biking":"\uf84a",
            "bimobject":"\uf378",
            "binoculars":"\uf1e5",
            "biohazard":"\uf780",
            "birthday-cake":"\uf1fd",
            "bitbucket":"\uf171",
            "bitcoin":"\uf379",
            "bity":"\uf37a",
            "black-tie":"\uf27e",
            "blackberry":"\uf37b",
            "blender":"\uf517",
            "blender-phone":"\uf6b6",
            "blind":"\uf29d",
            "blog":"\uf781",
            "blogger":"\uf37c",
            "blogger-b":"\uf37d",
            "bluetooth":"\uf293",
            "bluetooth-b":"\uf294",
            "bold":"\uf032",
            "bolt":"\uf0e7",
            "bomb":"\uf1e2",
            "bone":"\uf5d7",
            "bong":"\uf55c",
            "book":"\uf02d",
            "book-dead":"\uf6b7",
            "book-medical":"\uf7e6",
            "book-open":"\uf518",
            "book-reader":"\uf5da",
            "bookmark":"\uf02e",
            "bootstrap":"\uf836",
            "border-all":"\uf84c",
            "border-none":"\uf850",
            "border-style":"\uf853",
            "bowling-ball":"\uf436",
            "box":"\uf466",
            "box-open":"\uf49e",
            "boxes":"\uf468",
            "braille":"\uf2a1",
            "brain":"\uf5dc",
            "bread-slice":"\uf7ec",
            "briefcase":"\uf0b1",
            "briefcase-medical":"\uf469",
            "broadcast-tower":"\uf519",
            "broom":"\uf51a",
            "brush":"\uf55d",
            "btc":"\uf15a",
            "buffer":"\uf837",
            "bug":"\uf188",
            "building":"\uf1ad",
            "bullhorn":"\uf0a1",
            "bullseye":"\uf140",
            "burn":"\uf46a",
            "buromobelexperte":"\uf37f",
            "bus":"\uf207",
            "bus-alt":"\uf55e",
            "business-time":"\uf64a",
            "buysellads":"\uf20d",
            "calculator":"\uf1ec",
            "calendar":"\uf133",
            "calendar-alt":"\uf073",
            "calendar-check":"\uf274",
            "calendar-day":"\uf783",
            "calendar-minus":"\uf272",
            "calendar-plus":"\uf271",
            "calendar-times":"\uf273",
            "calendar-week":"\uf784",
            "camera":"\uf030",
            "camera-retro":"\uf083",
            "campground":"\uf6bb",
            "canadian-maple-leaf":"\uf785",
            "candy-cane":"\uf786",
            "cannabis":"\uf55f",
            "capsules":"\uf46b",
            "car":"\uf1b9",
            "car-alt":"\uf5de",
            "car-battery":"\uf5df",
            "car-crash":"\uf5e1",
            "car-side":"\uf5e4",
            "caret-down":"\uf0d7",
            "caret-left":"\uf0d9",
            "caret-right":"\uf0da",
            "caret-square-down":"\uf150",
            "caret-square-left":"\uf191",
            "caret-square-right":"\uf152",
            "caret-square-up":"\uf151",
            "caret-up":"\uf0d8",
            "carrot":"\uf787",
            "cart-arrow-down":"\uf218",
            "cart-plus":"\uf217",
            "cash-register":"\uf788",
            "cat":"\uf6be",
            "cc-amazon-pay":"\uf42d",
            "cc-amex":"\uf1f3",
            "cc-apple-pay":"\uf416",
            "cc-diners-club":"\uf24c",
            "cc-discover":"\uf1f2",
            "cc-jcb":"\uf24b",
            "cc-mastercard":"\uf1f1",
            "cc-paypal":"\uf1f4",
            "cc-stripe":"\uf1f5",
            "cc-visa":"\uf1f0",
            "centercode":"\uf380",
            "centos":"\uf789",
            "certificate":"\uf0a3",
            "chair":"\uf6c0",
            "chalkboard":"\uf51b",
            "chalkboard-teacher":"\uf51c",
            "charging-station":"\uf5e7",
            "chart-area":"\uf1fe",
            "chart-bar":"\uf080",
            "chart-line":"\uf201",
            "chart-pie":"\uf200",
            "check":"\uf00c",
            "check-circle":"\uf058",
            "check-double":"\uf560",
            "check-square":"\uf14a",
            "cheese":"\uf7ef",
            "chess":"\uf439",
            "chess-bishop":"\uf43a",
            "chess-board":"\uf43c",
            "chess-king":"\uf43f",
            "chess-knight":"\uf441",
            "chess-pawn":"\uf443",
            "chess-queen":"\uf445",
            "chess-rook":"\uf447",
            "chevron-circle-down":"\uf13a",
            "chevron-circle-left":"\uf137",
            "chevron-circle-right":"\uf138",
            "chevron-circle-up":"\uf139",
            "chevron-down":"\uf078",
            "chevron-left":"\uf053",
            "chevron-right":"\uf054",
            "chevron-up":"\uf077",
            "child":"\uf1ae",
            "chrome":"\uf268",
            "chromecast":"\uf838",
            "church":"\uf51d",
            "circle":"\uf111",
            "circle-notch":"\uf1ce",
            "city":"\uf64f",
            "clinic-medical":"\uf7f2",
            "clipboard":"\uf328",
            "clipboard-check":"\uf46c",
            "clipboard-list":"\uf46d",
            "clock":"\uf017",
            "clone":"\uf24d",
            "closed-captioning":"\uf20a",
            "cloud":"\uf0c2",
            "cloud-download-alt":"\uf381",
            "cloud-meatball":"\uf73b",
            "cloud-moon":"\uf6c3",
            "cloud-moon-rain":"\uf73c",
            "cloud-rain":"\uf73d",
            "cloud-showers-heavy":"\uf740",
            "cloud-sun":"\uf6c4",
            "cloud-sun-rain":"\uf743",
            "cloud-upload-alt":"\uf382",
            "cloudscale":"\uf383",
            "cloudsmith":"\uf384",
            "cloudversify":"\uf385",
            "cocktail":"\uf561",
            "code":"\uf121",
            "code-branch":"\uf126",
            "codepen":"\uf1cb",
            "codiepie":"\uf284",
            "coffee":"\uf0f4",
            "cog":"\uf013",
            "cogs":"\uf085",
            "coins":"\uf51e",
            "columns":"\uf0db",
            "comment":"\uf075",
            "comment-alt":"\uf27a",
            "comment-dollar":"\uf651",
            "comment-dots":"\uf4ad",
            "comment-medical":"\uf7f5",
            "comment-slash":"\uf4b3",
            "comments":"\uf086",
            "comments-dollar":"\uf653",
            "compact-disc":"\uf51f",
            "compass":"\uf14e",
            "compress":"\uf066",
            "compress-arrows-alt":"\uf78c",
            "concierge-bell":"\uf562",
            "confluence":"\uf78d",
            "connectdevelop":"\uf20e",
            "contao":"\uf26d",
            "cookie":"\uf563",
            "cookie-bite":"\uf564",
            "copy":"\uf0c5",
            "copyright":"\uf1f9",
            "couch":"\uf4b8",
            "cpanel":"\uf388",
            "creative-commons":"\uf25e",
            "creative-commons-by":"\uf4e7",
            "creative-commons-nc":"\uf4e8",
            "creative-commons-nc-eu":"\uf4e9",
            "creative-commons-nc-jp":"\uf4ea",
            "creative-commons-nd":"\uf4eb",
            "creative-commons-pd":"\uf4ec",
            "creative-commons-pd-alt":"\uf4ed",
            "creative-commons-remix":"\uf4ee",
            "creative-commons-sa":"\uf4ef",
            "creative-commons-sampling":"\uf4f0",
            "creative-commons-sampling-plus":"\uf4f1",
            "creative-commons-share":"\uf4f2",
            "creative-commons-zero":"\uf4f3",
            "credit-card":"\uf09d",
            "critical-role":"\uf6c9",
            "crop":"\uf125",
            "crop-alt":"\uf565",
            "cross":"\uf654",
            "crosshairs":"\uf05b",
            "crow":"\uf520",
            "crown":"\uf521",
            "crutch":"\uf7f7",
            "css3":"\uf13c",
            "css3-alt":"\uf38b",
            "cube":"\uf1b2",
            "cubes":"\uf1b3",
            "cut":"\uf0c4",
            "cuttlefish":"\uf38c",
            "d-and-d":"\uf38d",
            "d-and-d-beyond":"\uf6ca",
            "dashcube":"\uf210",
            "database":"\uf1c0",
            "deaf":"\uf2a4",
            "delicious":"\uf1a5",
            "democrat":"\uf747",
            "deploydog":"\uf38e",
            "deskpro":"\uf38f",
            "desktop":"\uf108",
            "dev":"\uf6cc",
            "deviantart":"\uf1bd",
            "dharmachakra":"\uf655",
            "dhl":"\uf790",
            "diagnoses":"\uf470",
            "diaspora":"\uf791",
            "dice":"\uf522",
            "dice-d20":"\uf6cf",
            "dice-d6":"\uf6d1",
            "dice-five":"\uf523",
            "dice-four":"\uf524",
            "dice-one":"\uf525",
            "dice-six":"\uf526",
            "dice-three":"\uf527",
            "dice-two":"\uf528",
            "digg":"\uf1a6",
            "digital-ocean":"\uf391",
            "digital-tachograph":"\uf566",
            "directions":"\uf5eb",
            "discord":"\uf392",
            "discourse":"\uf393",
            "divide":"\uf529",
            "dizzy":"\uf567",
            "dna":"\uf471",
            "dochub":"\uf394",
            "docker":"\uf395",
            "dog":"\uf6d3",
            "dollar-sign":"\uf155",
            "dolly":"\uf472",
            "dolly-flatbed":"\uf474",
            "donate":"\uf4b9",
            "door-closed":"\uf52a",
            "door-open":"\uf52b",
            "dot-circle":"\uf192",
            "dove":"\uf4ba",
            "download":"\uf019",
            "draft2digital":"\uf396",
            "drafting-compass":"\uf568",
            "dragon":"\uf6d5",
            "draw-polygon":"\uf5ee",
            "dribbble":"\uf17d",
            "dribbble-square":"\uf397",
            "dropbox":"\uf16b",
            "drum":"\uf569",
            "drum-steelpan":"\uf56a",
            "drumstick-bite":"\uf6d7",
            "drupal":"\uf1a9",
            "dumbbell":"\uf44b",
            "dumpster":"\uf793",
            "dumpster-fire":"\uf794",
            "dungeon":"\uf6d9",
            "dyalog":"\uf399",
            "earlybirds":"\uf39a",
            "ebay":"\uf4f4",
            "edge":"\uf282",
            "edit":"\uf044",
            "egg":"\uf7fb",
            "eject":"\uf052",
            "elementor":"\uf430",
            "ellipsis-h":"\uf141",
            "ellipsis-v":"\uf142",
            "ello":"\uf5f1",
            "ember":"\uf423",
            "empire":"\uf1d1",
            "envelope":"\uf0e0",
            "envelope-open":"\uf2b6",
            "envelope-open-text":"\uf658",
            "envelope-square":"\uf199",
            "envira":"\uf299",
            "equals":"\uf52c",
            "eraser":"\uf12d",
            "erlang":"\uf39d",
            "ethereum":"\uf42e",
            "ethernet":"\uf796",
            "etsy":"\uf2d7",
            "euro-sign":"\uf153",
            "evernote":"\uf839",
            "exchange-alt":"\uf362",
            "exclamation":"\uf12a",
            "exclamation-circle":"\uf06a",
            "exclamation-triangle":"\uf071",
            "expand":"\uf065",
            "expand-arrows-alt":"\uf31e",
            "expeditedssl":"\uf23e",
            "external-link-alt":"\uf35d",
            "external-link-square-alt":"\uf360",
            "eye":"\uf06e",
            "eye-dropper":"\uf1fb",
            "eye-slash":"\uf070",
            "facebook":"\uf09a",
            "facebook-f":"\uf39e",
            "facebook-messenger":"\uf39f",
            "facebook-square":"\uf082",
            "fan":"\uf863",
            "fantasy-flight-games":"\uf6dc",
            "fast-backward":"\uf049",
            "fast-forward":"\uf050",
            "fax":"\uf1ac",
            "feather":"\uf52d",
            "feather-alt":"\uf56b",
            "fedex":"\uf797",
            "fedora":"\uf798",
            "female":"\uf182",
            "fighter-jet":"\uf0fb",
            "figma":"\uf799",
            "file":"\uf15b",
            "file-alt":"\uf15c",
            "file-archive":"\uf1c6",
            "file-audio":"\uf1c7",
            "file-code":"\uf1c9",
            "file-contract":"\uf56c",
            "file-csv":"\uf6dd",
            "file-download":"\uf56d",
            "file-excel":"\uf1c3",
            "file-export":"\uf56e",
            "file-image":"\uf1c5",
            "file-import":"\uf56f",
            "file-invoice":"\uf570",
            "file-invoice-dollar":"\uf571",
            "file-medical":"\uf477",
            "file-medical-alt":"\uf478",
            "file-pdf":"\uf1c1",
            "file-powerpoint":"\uf1c4",
            "file-prescription":"\uf572",
            "file-signature":"\uf573",
            "file-upload":"\uf574",
            "file-video":"\uf1c8",
            "file-word":"\uf1c2",
            "fill":"\uf575",
            "fill-drip":"\uf576",
            "film":"\uf008",
            "filter":"\uf0b0",
            "fingerprint":"\uf577",
            "fire":"\uf06d",
            "fire-alt":"\uf7e4",
            "fire-extinguisher":"\uf134",
            "firefox":"\uf269",
            "first-aid":"\uf479",
            "first-order":"\uf2b0",
            "first-order-alt":"\uf50a",
            "firstdraft":"\uf3a1",
            "fish":"\uf578",
            "fist-raised":"\uf6de",
            "flag":"\uf024",
            "flag-checkered":"\uf11e",
            "flag-usa":"\uf74d",
            "flask":"\uf0c3",
            "flickr":"\uf16e",
            "flipboard":"\uf44d",
            "flushed":"\uf579",
            "fly":"\uf417",
            "folder":"\uf07b",
            "folder-minus":"\uf65d",
            "folder-open":"\uf07c",
            "folder-plus":"\uf65e",
            "font":"\uf031",
            "font-awesome":"\uf2b4",
            "font-awesome-alt":"\uf35c",
            "font-awesome-flag":"\uf425",
            "font-awesome-logo-full":"\uf4e6",
            "fonticons":"\uf280",
            "fonticons-fi":"\uf3a2",
            "football-ball":"\uf44e",
            "fort-awesome":"\uf286",
            "fort-awesome-alt":"\uf3a3",
            "forumbee":"\uf211",
            "forward":"\uf04e",
            "foursquare":"\uf180",
            "free-code-camp":"\uf2c5",
            "freebsd":"\uf3a4",
            "frog":"\uf52e",
            "frown":"\uf119",
            "frown-open":"\uf57a",
            "fulcrum":"\uf50b",
            "funnel-dollar":"\uf662",
            "futbol":"\uf1e3",
            "galactic-republic":"\uf50c",
            "galactic-senate":"\uf50d",
            "gamepad":"\uf11b",
            "gas-pump":"\uf52f",
            "gavel":"\uf0e3",
            "gem":"\uf3a5",
            "genderless":"\uf22d",
            "get-pocket":"\uf265",
            "gg":"\uf260",
            "gg-circle":"\uf261",
            "ghost":"\uf6e2",
            "gift":"\uf06b",
            "gifts":"\uf79c",
            "git":"\uf1d3",
            "git-alt":"\uf841",
            "git-square":"\uf1d2",
            "github":"\uf09b",
            "github-alt":"\uf113",
            "github-square":"\uf092",
            "gitkraken":"\uf3a6",
            "gitlab":"\uf296",
            "gitter":"\uf426",
            "glass-cheers":"\uf79f",
            "glass-martini":"\uf000",
            "glass-martini-alt":"\uf57b",
            "glass-whiskey":"\uf7a0",
            "glasses":"\uf530",
            "glide":"\uf2a5",
            "glide-g":"\uf2a6",
            "globe":"\uf0ac",
            "globe-africa":"\uf57c",
            "globe-americas":"\uf57d",
            "globe-asia":"\uf57e",
            "globe-europe":"\uf7a2",
            "gofore":"\uf3a7",
            "golf-ball":"\uf450",
            "goodreads":"\uf3a8",
            "goodreads-g":"\uf3a9",
            "google":"\uf1a0",
            "google-drive":"\uf3aa",
            "google-play":"\uf3ab",
            "google-plus":"\uf2b3",
            "google-plus-g":"\uf0d5",
            "google-plus-square":"\uf0d4",
            "google-wallet":"\uf1ee",
            "gopuram":"\uf664",
            "graduation-cap":"\uf19d",
            "gratipay":"\uf184",
            "grav":"\uf2d6",
            "greater-than":"\uf531",
            "greater-than-equal":"\uf532",
            "grimace":"\uf57f",
            "grin":"\uf580",
            "grin-alt":"\uf581",
            "grin-beam":"\uf582",
            "grin-beam-sweat":"\uf583",
            "grin-hearts":"\uf584",
            "grin-squint":"\uf585",
            "grin-squint-tears":"\uf586",
            "grin-stars":"\uf587",
            "grin-tears":"\uf588",
            "grin-tongue":"\uf589",
            "grin-tongue-squint":"\uf58a",
            "grin-tongue-wink":"\uf58b",
            "grin-wink":"\uf58c",
            "grip-horizontal":"\uf58d",
            "grip-lines":"\uf7a4",
            "grip-lines-vertical":"\uf7a5",
            "grip-vertical":"\uf58e",
            "gripfire":"\uf3ac",
            "grunt":"\uf3ad",
            "guitar":"\uf7a6",
            "gulp":"\uf3ae",
            "h-square":"\uf0fd",
            "hacker-news":"\uf1d4",
            "hacker-news-square":"\uf3af",
            "hackerrank":"\uf5f7",
            "hamburger":"\uf805",
            "hammer":"\uf6e3",
            "hamsa":"\uf665",
            "hand-holding":"\uf4bd",
            "hand-holding-heart":"\uf4be",
            "hand-holding-usd":"\uf4c0",
            "hand-lizard":"\uf258",
            "hand-middle-finger":"\uf806",
            "hand-paper":"\uf256",
            "hand-peace":"\uf25b",
            "hand-point-down":"\uf0a7",
            "hand-point-left":"\uf0a5",
            "hand-point-right":"\uf0a4",
            "hand-point-up":"\uf0a6",
            "hand-pointer":"\uf25a",
            "hand-rock":"\uf255",
            "hand-scissors":"\uf257",
            "hand-spock":"\uf259",
            "hands":"\uf4c2",
            "hands-helping":"\uf4c4",
            "handshake":"\uf2b5",
            "hanukiah":"\uf6e6",
            "hard-hat":"\uf807",
            "hashtag":"\uf292",
            "hat-wizard":"\uf6e8",
            "haykal":"\uf666",
            "hdd":"\uf0a0",
            "heading":"\uf1dc",
            "headphones":"\uf025",
            "headphones-alt":"\uf58f",
            "headset":"\uf590",
            "heart":"\uf004",
            "heart-broken":"\uf7a9",
            "heartbeat":"\uf21e",
            "helicopter":"\uf533",
            "highlighter":"\uf591",
            "hiking":"\uf6ec",
            "hippo":"\uf6ed",
            "hips":"\uf452",
            "hire-a-helper":"\uf3b0",
            "history":"\uf1da",
            "hockey-puck":"\uf453",
            "holly-berry":"\uf7aa",
            "home":"\uf015",
            "hooli":"\uf427",
            "hornbill":"\uf592",
            "horse":"\uf6f0",
            "horse-head":"\uf7ab",
            "hospital":"\uf0f8",
            "hospital-alt":"\uf47d",
            "hospital-symbol":"\uf47e",
            "hot-tub":"\uf593",
            "hotdog":"\uf80f",
            "hotel":"\uf594",
            "hotjar":"\uf3b1",
            "hourglass":"\uf254",
            "hourglass-end":"\uf253",
            "hourglass-half":"\uf252",
            "hourglass-start":"\uf251",
            "house-damage":"\uf6f1",
            "houzz":"\uf27c",
            "hryvnia":"\uf6f2",
            "html5":"\uf13b",
            "hubspot":"\uf3b2",
            "i-cursor":"\uf246",
            "ice-cream":"\uf810",
            "icicles":"\uf7ad",
            "icons":"\uf86d",
            "id-badge":"\uf2c1",
            "id-card":"\uf2c2",
            "id-card-alt":"\uf47f",
            "igloo":"\uf7ae",
            "image":"\uf03e",
            "images":"\uf302",
            "imdb":"\uf2d8",
            "inbox":"\uf01c",
            "indent":"\uf03c",
            "industry":"\uf275",
            "infinity":"\uf534",
            "info":"\uf129",
            "info-circle":"\uf05a",
            "instagram":"\uf16d",
            "intercom":"\uf7af",
            "internet-explorer":"\uf26b",
            "invision":"\uf7b0",
            "ioxhost":"\uf208",
            "italic":"\uf033",
            "itch-io":"\uf83a",
            "itunes":"\uf3b4",
            "itunes-note":"\uf3b5",
            "java":"\uf4e4",
            "jedi":"\uf669",
            "jedi-order":"\uf50e",
            "jenkins":"\uf3b6",
            "jira":"\uf7b1",
            "joget":"\uf3b7",
            "joint":"\uf595",
            "joomla":"\uf1aa",
            "journal-whills":"\uf66a",
            "js":"\uf3b8",
            "js-square":"\uf3b9",
            "jsfiddle":"\uf1cc",
            "kaaba":"\uf66b",
            "kaggle":"\uf5fa",
            "key":"\uf084",
            "keybase":"\uf4f5",
            "keyboard":"\uf11c",
            "keycdn":"\uf3ba",
            "khanda":"\uf66d",
            "kickstarter":"\uf3bb",
            "kickstarter-k":"\uf3bc",
            "kiss":"\uf596",
            "kiss-beam":"\uf597",
            "kiss-wink-heart":"\uf598",
            "kiwi-bird":"\uf535",
            "korvue":"\uf42f",
            "landmark":"\uf66f",
            "language":"\uf1ab",
            "laptop":"\uf109",
            "laptop-code":"\uf5fc",
            "laptop-medical":"\uf812",
            "laravel":"\uf3bd",
            "lastfm":"\uf202",
            "lastfm-square":"\uf203",
            "laugh":"\uf599",
            "laugh-beam":"\uf59a",
            "laugh-squint":"\uf59b",
            "laugh-wink":"\uf59c",
            "layer-group":"\uf5fd",
            "leaf":"\uf06c",
            "leanpub":"\uf212",
            "lemon":"\uf094",
            "less":"\uf41d",
            "less-than":"\uf536",
            "less-than-equal":"\uf537",
            "level-down-alt":"\uf3be",
            "level-up-alt":"\uf3bf",
            "life-ring":"\uf1cd",
            "lightbulb":"\uf0eb",
            "line":"\uf3c0",
            "link":"\uf0c1",
            "linkedin":"\uf08c",
            "linkedin-in":"\uf0e1",
            "linode":"\uf2b8",
            "linux":"\uf17c",
            "lira-sign":"\uf195",
            "list":"\uf03a",
            "list-alt":"\uf022",
            "list-ol":"\uf0cb",
            "list-ul":"\uf0ca",
            "location-arrow":"\uf124",
            "lock":"\uf023",
            "lock-open":"\uf3c1",
            "long-arrow-alt-down":"\uf309",
            "long-arrow-alt-left":"\uf30a",
            "long-arrow-alt-right":"\uf30b",
            "long-arrow-alt-up":"\uf30c",
            "low-vision":"\uf2a8",
            "luggage-cart":"\uf59d",
            "lyft":"\uf3c3",
            "magento":"\uf3c4",
            "magic":"\uf0d0",
            "magnet":"\uf076",
            "mail-bulk":"\uf674",
            "mailchimp":"\uf59e",
            "male":"\uf183",
            "mandalorian":"\uf50f",
            "map":"\uf279",
            "map-marked":"\uf59f",
            "map-marked-alt":"\uf5a0",
            "map-marker":"\uf041",
            "map-marker-alt":"\uf3c5",
            "map-pin":"\uf276",
            "map-signs":"\uf277",
            "markdown":"\uf60f",
            "marker":"\uf5a1",
            "mars":"\uf222",
            "mars-double":"\uf227",
            "mars-stroke":"\uf229",
            "mars-stroke-h":"\uf22b",
            "mars-stroke-v":"\uf22a",
            "mask":"\uf6fa",
            "mastodon":"\uf4f6",
            "maxcdn":"\uf136",
            "medal":"\uf5a2",
            "medapps":"\uf3c6",
            "medium":"\uf23a",
            "medium-m":"\uf3c7",
            "medkit":"\uf0fa",
            "medrt":"\uf3c8",
            "meetup":"\uf2e0",
            "megaport":"\uf5a3",
            "meh":"\uf11a",
            "meh-blank":"\uf5a4",
            "meh-rolling-eyes":"\uf5a5",
            "memory":"\uf538",
            "mendeley":"\uf7b3",
            "menorah":"\uf676",
            "mercury":"\uf223",
            "meteor":"\uf753",
            "microchip":"\uf2db",
            "microphone":"\uf130",
            "microphone-alt":"\uf3c9",
            "microphone-alt-slash":"\uf539",
            "microphone-slash":"\uf131",
            "microscope":"\uf610",
            "microsoft":"\uf3ca",
            "minus":"\uf068",
            "minus-circle":"\uf056",
            "minus-square":"\uf146",
            "mitten":"\uf7b5",
            "mix":"\uf3cb",
            "mixcloud":"\uf289",
            "mizuni":"\uf3cc",
            "mobile":"\uf10b",
            "mobile-alt":"\uf3cd",
            "modx":"\uf285",
            "monero":"\uf3d0",
            "money-bill":"\uf0d6",
            "money-bill-alt":"\uf3d1",
            "money-bill-wave":"\uf53a",
            "money-bill-wave-alt":"\uf53b",
            "money-check":"\uf53c",
            "money-check-alt":"\uf53d",
            "monument":"\uf5a6",
            "moon":"\uf186",
            "mortar-pestle":"\uf5a7",
            "mosque":"\uf678",
            "motorcycle":"\uf21c",
            "mountain":"\uf6fc",
            "mouse-pointer":"\uf245",
            "mug-hot":"\uf7b6",
            "music":"\uf001",
            "napster":"\uf3d2",
            "neos":"\uf612",
            "network-wired":"\uf6ff",
            "neuter":"\uf22c",
            "newspaper":"\uf1ea",
            "nimblr":"\uf5a8",
            "node":"\uf419",
            "node-js":"\uf3d3",
            "not-equal":"\uf53e",
            "notes-medical":"\uf481",
            "npm":"\uf3d4",
            "ns8":"\uf3d5",
            "nutritionix":"\uf3d6",
            "object-group":"\uf247",
            "object-ungroup":"\uf248",
            "odnoklassniki":"\uf263",
            "odnoklassniki-square":"\uf264",
            "oil-can":"\uf613",
            "old-republic":"\uf510",
            "om":"\uf679",
            "opencart":"\uf23d",
            "openid":"\uf19b",
            "opera":"\uf26a",
            "optin-monster":"\uf23c",
            "osi":"\uf41a",
            "otter":"\uf700",
            "outdent":"\uf03b",
            "page4":"\uf3d7",
            "pagelines":"\uf18c",
            "pager":"\uf815",
            "paint-brush":"\uf1fc",
            "paint-roller":"\uf5aa",
            "palette":"\uf53f",
            "palfed":"\uf3d8",
            "pallet":"\uf482",
            "paper-plane":"\uf1d8",
            "paperclip":"\uf0c6",
            "parachute-box":"\uf4cd",
            "paragraph":"\uf1dd",
            "parking":"\uf540",
            "passport":"\uf5ab",
            "pastafarianism":"\uf67b",
            "paste":"\uf0ea",
            "patreon":"\uf3d9",
            "pause":"\uf04c",
            "pause-circle":"\uf28b",
            "paw":"\uf1b0",
            "paypal":"\uf1ed",
            "peace":"\uf67c",
            "pen":"\uf304",
            "pen-alt":"\uf305",
            "pen-fancy":"\uf5ac",
            "pen-nib":"\uf5ad",
            "pen-square":"\uf14b",
            "pencil-alt":"\uf303",
            "pencil-ruler":"\uf5ae",
            "penny-arcade":"\uf704",
            "people-carry":"\uf4ce",
            "pepper-hot":"\uf816",
            "percent":"\uf295",
            "percentage":"\uf541",
            "periscope":"\uf3da",
            "person-booth":"\uf756",
            "phabricator":"\uf3db",
            "phoenix-framework":"\uf3dc",
            "phoenix-squadron":"\uf511",
            "phone":"\uf095",
            "phone-alt":"\uf879",
            "phone-slash":"\uf3dd",
            "phone-square":"\uf098",
            "phone-square-alt":"\uf87b",
            "phone-volume":"\uf2a0",
            "photo-video":"\uf87c",
            "php":"\uf457",
            "pied-piper":"\uf2ae",
            "pied-piper-alt":"\uf1a8",
            "pied-piper-hat":"\uf4e5",
            "pied-piper-pp":"\uf1a7",
            "piggy-bank":"\uf4d3",
            "pills":"\uf484",
            "pinterest":"\uf0d2",
            "pinterest-p":"\uf231",
            "pinterest-square":"\uf0d3",
            "pizza-slice":"\uf818",
            "place-of-worship":"\uf67f",
            "plane":"\uf072",
            "plane-arrival":"\uf5af",
            "plane-departure":"\uf5b0",
            "play":"\uf04b",
            "play-circle":"\uf144",
            "playstation":"\uf3df",
            "plug":"\uf1e6",
            "plus":"\uf067",
            "plus-circle":"\uf055",
            "plus-square":"\uf0fe",
            "podcast":"\uf2ce",
            "poll":"\uf681",
            "poll-h":"\uf682",
            "poo":"\uf2fe",
            "poo-storm":"\uf75a",
            "poop":"\uf619",
            "portrait":"\uf3e0",
            "pound-sign":"\uf154",
            "power-off":"\uf011",
            "pray":"\uf683",
            "praying-hands":"\uf684",
            "prescription":"\uf5b1",
            "prescription-bottle":"\uf485",
            "prescription-bottle-alt":"\uf486",
            "print":"\uf02f",
            "procedures":"\uf487",
            "product-hunt":"\uf288",
            "project-diagram":"\uf542",
            "pushed":"\uf3e1",
            "puzzle-piece":"\uf12e",
            "python":"\uf3e2",
            "qq":"\uf1d6",
            "qrcode":"\uf029",
            "question":"\uf128",
            "question-circle":"\uf059",
            "quidditch":"\uf458",
            "quinscape":"\uf459",
            "quora":"\uf2c4",
            "quote-left":"\uf10d",
            "quote-right":"\uf10e",
            "quran":"\uf687",
            "r-project":"\uf4f7",
            "radiation":"\uf7b9",
            "radiation-alt":"\uf7ba",
            "rainbow":"\uf75b",
            "random":"\uf074",
            "raspberry-pi":"\uf7bb",
            "ravelry":"\uf2d9",
            "react":"\uf41b",
            "reacteurope":"\uf75d",
            "readme":"\uf4d5",
            "rebel":"\uf1d0",
            "receipt":"\uf543",
            "recycle":"\uf1b8",
            "red-river":"\uf3e3",
            "reddit":"\uf1a1",
            "reddit-alien":"\uf281",
            "reddit-square":"\uf1a2",
            "redhat":"\uf7bc",
            "redo":"\uf01e",
            "redo-alt":"\uf2f9",
            "registered":"\uf25d",
            "remove-format":"\uf87d",
            "renren":"\uf18b",
            "reply":"\uf3e5",
            "reply-all":"\uf122",
            "replyd":"\uf3e6",
            "republican":"\uf75e",
            "researchgate":"\uf4f8",
            "resolving":"\uf3e7",
            "restroom":"\uf7bd",
            "retweet":"\uf079",
            "rev":"\uf5b2",
            "ribbon":"\uf4d6",
            "ring":"\uf70b",
            "road":"\uf018",
            "robot":"\uf544",
            "rocket":"\uf135",
            "rocketchat":"\uf3e8",
            "rockrms":"\uf3e9",
            "route":"\uf4d7",
            "rss":"\uf09e",
            "rss-square":"\uf143",
            "ruble-sign":"\uf158",
            "ruler":"\uf545",
            "ruler-combined":"\uf546",
            "ruler-horizontal":"\uf547",
            "ruler-vertical":"\uf548",
            "running":"\uf70c",
            "rupee-sign":"\uf156",
            "sad-cry":"\uf5b3",
            "sad-tear":"\uf5b4",
            "safari":"\uf267",
            "salesforce":"\uf83b",
            "sass":"\uf41e",
            "satellite":"\uf7bf",
            "satellite-dish":"\uf7c0",
            "save":"\uf0c7",
            "schlix":"\uf3ea",
            "school":"\uf549",
            "screwdriver":"\uf54a",
            "scribd":"\uf28a",
            "scroll":"\uf70e",
            "sd-card":"\uf7c2",
            "search":"\uf002",
            "search-dollar":"\uf688",
            "search-location":"\uf689",
            "search-minus":"\uf010",
            "search-plus":"\uf00e",
            "searchengin":"\uf3eb",
            "seedling":"\uf4d8",
            "sellcast":"\uf2da",
            "sellsy":"\uf213",
            "server":"\uf233",
            "servicestack":"\uf3ec",
            "shapes":"\uf61f",
            "share":"\uf064",
            "share-alt":"\uf1e0",
            "share-alt-square":"\uf1e1",
            "share-square":"\uf14d",
            "shekel-sign":"\uf20b",
            "shield-alt":"\uf3ed",
            "ship":"\uf21a",
            "shipping-fast":"\uf48b",
            "shirtsinbulk":"\uf214",
            "shoe-prints":"\uf54b",
            "shopping-bag":"\uf290",
            "shopping-basket":"\uf291",
            "shopping-cart":"\uf07a",
            "shopware":"\uf5b5",
            "shower":"\uf2cc",
            "shuttle-van":"\uf5b6",
            "sign":"\uf4d9",
            "sign-in-alt":"\uf2f6",
            "sign-language":"\uf2a7",
            "sign-out-alt":"\uf2f5",
            "signal":"\uf012",
            "signature":"\uf5b7",
            "sim-card":"\uf7c4",
            "simplybuilt":"\uf215",
            "sistrix":"\uf3ee",
            "sitemap":"\uf0e8",
            "sith":"\uf512",
            "skating":"\uf7c5",
            "sketch":"\uf7c6",
            "skiing":"\uf7c9",
            "skiing-nordic":"\uf7ca",
            "skull":"\uf54c",
            "skull-crossbones":"\uf714",
            "skyatlas":"\uf216",
            "skype":"\uf17e",
            "slack":"\uf198",
            "slack-hash":"\uf3ef",
            "slash":"\uf715",
            "sleigh":"\uf7cc",
            "sliders-h":"\uf1de",
            "slideshare":"\uf1e7",
            "smile":"\uf118",
            "smile-beam":"\uf5b8",
            "smile-wink":"\uf4da",
            "smog":"\uf75f",
            "smoking":"\uf48d",
            "smoking-ban":"\uf54d",
            "sms":"\uf7cd",
            "snapchat":"\uf2ab",
            "snapchat-ghost":"\uf2ac",
            "snapchat-square":"\uf2ad",
            "snowboarding":"\uf7ce",
            "snowflake":"\uf2dc",
            "snowman":"\uf7d0",
            "snowplow":"\uf7d2",
            "socks":"\uf696",
            "solar-panel":"\uf5ba",
            "sort":"\uf0dc",
            "sort-alpha-down":"\uf15d",
            "sort-alpha-down-alt":"\uf881",
            "sort-alpha-up":"\uf15e",
            "sort-alpha-up-alt":"\uf882",
            "sort-amount-down":"\uf160",
            "sort-amount-down-alt":"\uf884",
            "sort-amount-up":"\uf161",
            "sort-amount-up-alt":"\uf885",
            "sort-down":"\uf0dd",
            "sort-numeric-down":"\uf162",
            "sort-numeric-down-alt":"\uf886",
            "sort-numeric-up":"\uf163",
            "sort-numeric-up-alt":"\uf887",
            "sort-up":"\uf0de",
            "soundcloud":"\uf1be",
            "sourcetree":"\uf7d3",
            "spa":"\uf5bb",
            "space-shuttle":"\uf197",
            "speakap":"\uf3f3",
            "speaker-deck":"\uf83c",
            "spell-check":"\uf891",
            "spider":"\uf717",
            "spinner":"\uf110",
            "splotch":"\uf5bc",
            "spotify":"\uf1bc",
            "spray-can":"\uf5bd",
            "square":"\uf0c8",
            "square-full":"\uf45c",
            "square-root-alt":"\uf698",
            "squarespace":"\uf5be",
            "stack-exchange":"\uf18d",
            "stack-overflow":"\uf16c",
            "stackpath":"\uf842",
            "stamp":"\uf5bf",
            "star":"\uf005",
            "star-and-crescent":"\uf699",
            "star-half":"\uf089",
            "star-half-alt":"\uf5c0",
            "star-of-david":"\uf69a",
            "star-of-life":"\uf621",
            "staylinked":"\uf3f5",
            "steam":"\uf1b6",
            "steam-square":"\uf1b7",
            "steam-symbol":"\uf3f6",
            "step-backward":"\uf048",
            "step-forward":"\uf051",
            "stethoscope":"\uf0f1",
            "sticker-mule":"\uf3f7",
            "sticky-note":"\uf249",
            "stop":"\uf04d",
            "stop-circle":"\uf28d",
            "stopwatch":"\uf2f2",
            "store":"\uf54e",
            "store-alt":"\uf54f",
            "strava":"\uf428",
            "stream":"\uf550",
            "street-view":"\uf21d",
            "strikethrough":"\uf0cc",
            "stripe":"\uf429",
            "stripe-s":"\uf42a",
            "stroopwafel":"\uf551",
            "studiovinari":"\uf3f8",
            "stumbleupon":"\uf1a4",
            "stumbleupon-circle":"\uf1a3",
            "subscript":"\uf12c",
            "subway":"\uf239",
            "suitcase":"\uf0f2",
            "suitcase-rolling":"\uf5c1",
            "sun":"\uf185",
            "superpowers":"\uf2dd",
            "superscript":"\uf12b",
            "supple":"\uf3f9",
            "surprise":"\uf5c2",
            "suse":"\uf7d6",
            "swatchbook":"\uf5c3",
            "swimmer":"\uf5c4",
            "swimming-pool":"\uf5c5",
            "symfony":"\uf83d",
            "synagogue":"\uf69b",
            "sync":"\uf021",
            "sync-alt":"\uf2f1",
            "syringe":"\uf48e",
            "table":"\uf0ce",
            "table-tennis":"\uf45d",
            "tablet":"\uf10a",
            "tablet-alt":"\uf3fa",
            "tablets":"\uf490",
            "tachometer-alt":"\uf3fd",
            "tag":"\uf02b",
            "tags":"\uf02c",
            "tape":"\uf4db",
            "tasks":"\uf0ae",
            "taxi":"\uf1ba",
            "teamspeak":"\uf4f9",
            "teeth":"\uf62e",
            "teeth-open":"\uf62f",
            "telegram":"\uf2c6",
            "telegram-plane":"\uf3fe",
            "temperature-high":"\uf769",
            "temperature-low":"\uf76b",
            "tencent-weibo":"\uf1d5",
            "tenge":"\uf7d7",
            "terminal":"\uf120",
            "text-height":"\uf034",
            "text-width":"\uf035",
            "th":"\uf00a",
            "th-large":"\uf009",
            "th-list":"\uf00b",
            "the-red-yeti":"\uf69d",
            "theater-masks":"\uf630",
            "themeco":"\uf5c6",
            "themeisle":"\uf2b2",
            "thermometer":"\uf491",
            "thermometer-empty":"\uf2cb",
            "thermometer-full":"\uf2c7",
            "thermometer-half":"\uf2c9",
            "thermometer-quarter":"\uf2ca",
            "thermometer-three-quarters":"\uf2c8",
            "think-peaks":"\uf731",
            "thumbs-down":"\uf165",
            "thumbs-up":"\uf164",
            "thumbtack":"\uf08d",
            "ticket-alt":"\uf3ff",
            "times":"\uf00d",
            "times-circle":"\uf057",
            "tint":"\uf043",
            "tint-slash":"\uf5c7",
            "tired":"\uf5c8",
            "toggle-off":"\uf204",
            "toggle-on":"\uf205",
            "toilet":"\uf7d8",
            "toilet-paper":"\uf71e",
            "toolbox":"\uf552",
            "tools":"\uf7d9",
            "tooth":"\uf5c9",
            "torah":"\uf6a0",
            "torii-gate":"\uf6a1",
            "tractor":"\uf722",
            "trade-federation":"\uf513",
            "trademark":"\uf25c",
            "traffic-light":"\uf637",
            "train":"\uf238",
            "tram":"\uf7da",
            "transgender":"\uf224",
            "transgender-alt":"\uf225",
            "trash":"\uf1f8",
            "trash-alt":"\uf2ed",
            "trash-restore":"\uf829",
            "trash-restore-alt":"\uf82a",
            "tree":"\uf1bb",
            "trello":"\uf181",
            "tripadvisor":"\uf262",
            "trophy":"\uf091",
            "truck":"\uf0d1",
            "truck-loading":"\uf4de",
            "truck-monster":"\uf63b",
            "truck-moving":"\uf4df",
            "truck-pickup":"\uf63c",
            "tshirt":"\uf553",
            "tty":"\uf1e4",
            "tumblr":"\uf173",
            "tumblr-square":"\uf174",
            "tv":"\uf26c",
            "twitch":"\uf1e8",
            "twitter":"\uf099",
            "twitter-square":"\uf081",
            "typo3":"\uf42b",
            "uber":"\uf402",
            "ubuntu":"\uf7df",
            "uikit":"\uf403",
            "umbrella":"\uf0e9",
            "umbrella-beach":"\uf5ca",
            "underline":"\uf0cd",
            "undo":"\uf0e2",
            "undo-alt":"\uf2ea",
            "uniregistry":"\uf404",
            "universal-access":"\uf29a",
            "university":"\uf19c",
            "unlink":"\uf127",
            "unlock":"\uf09c",
            "unlock-alt":"\uf13e",
            "untappd":"\uf405",
            "upload":"\uf093",
            "ups":"\uf7e0",
            "usb":"\uf287",
            "user":"\uf007",
            "user-alt":"\uf406",
            "user-alt-slash":"\uf4fa",
            "user-astronaut":"\uf4fb",
            "user-check":"\uf4fc",
            "user-circle":"\uf2bd",
            "user-clock":"\uf4fd",
            "user-cog":"\uf4fe",
            "user-edit":"\uf4ff",
            "user-friends":"\uf500",
            "user-graduate":"\uf501",
            "user-injured":"\uf728",
            "user-lock":"\uf502",
            "user-md":"\uf0f0",
            "user-minus":"\uf503",
            "user-ninja":"\uf504",
            "user-nurse":"\uf82f",
            "user-plus":"\uf234",
            "user-secret":"\uf21b",
            "user-shield":"\uf505",
            "user-slash":"\uf506",
            "user-tag":"\uf507",
            "user-tie":"\uf508",
            "user-times":"\uf235",
            "users":"\uf0c0",
            "users-cog":"\uf509",
            "usps":"\uf7e1",
            "ussunnah":"\uf407",
            "utensil-spoon":"\uf2e5",
            "utensils":"\uf2e7",
            "vaadin":"\uf408",
            "vector-square":"\uf5cb",
            "venus":"\uf221",
            "venus-double":"\uf226",
            "venus-mars":"\uf228",
            "viacoin":"\uf237",
            "viadeo":"\uf2a9",
            "viadeo-square":"\uf2aa",
            "vial":"\uf492",
            "vials":"\uf493",
            "viber":"\uf409",
            "video":"\uf03d",
            "video-slash":"\uf4e2",
            "vihara":"\uf6a7",
            "vimeo":"\uf40a",
            "vimeo-square":"\uf194",
            "vimeo-v":"\uf27d",
            "vine":"\uf1ca",
            "vk":"\uf189",
            "vnv":"\uf40b",
            "voicemail":"\uf897",
            "volleyball-ball":"\uf45f",
            "volume-down":"\uf027",
            "volume-mute":"\uf6a9",
            "volume-off":"\uf026",
            "volume-up":"\uf028",
            "vote-yea":"\uf772",
            "vr-cardboard":"\uf729",
            "vuejs":"\uf41f",
            "walking":"\uf554",
            "wallet":"\uf555",
            "warehouse":"\uf494",
            "water":"\uf773",
            "wave-square":"\uf83e",
            "waze":"\uf83f",
            "weebly":"\uf5cc",
            "weibo":"\uf18a",
            "weight":"\uf496",
            "weight-hanging":"\uf5cd",
            "weixin":"\uf1d7",
            "whatsapp":"\uf232",
            "whatsapp-square":"\uf40c",
            "wheelchair":"\uf193",
            "whmcs":"\uf40d",
            "wifi":"\uf1eb",
            "wikipedia-w":"\uf266",
            "wind":"\uf72e",
            "window-close":"\uf410",
            "window-maximize":"\uf2d0",
            "window-minimize":"\uf2d1",
            "window-restore":"\uf2d2",
            "windows":"\uf17a",
            "wine-bottle":"\uf72f",
            "wine-glass":"\uf4e3",
            "wine-glass-alt":"\uf5ce",
            "wix":"\uf5cf",
            "wizards-of-the-coast":"\uf730",
            "wolf-pack-battalion":"\uf514",
            "won-sign":"\uf159",
            "wordpress":"\uf19a",
            "wordpress-simple":"\uf411",
            "wpbeginner":"\uf297",
            "wpexplorer":"\uf2de",
            "wpforms":"\uf298",
            "wpressr":"\uf3e4",
            "wrench":"\uf0ad",
            "x-ray":"\uf497",
            "xbox":"\uf412",
            "xing":"\uf168",
            "xing-square":"\uf169",
            "y-combinator":"\uf23b",
            "yahoo":"\uf19e",
            "yammer":"\uf840",
            "yandex":"\uf413",
            "yandex-international":"\uf414",
            "yarn":"\uf7e3",
            "yelp":"\uf1e9",
            "yen-sign":"\uf157",
            "yin-yang":"\uf6ad",
            "yoast":"\uf2b1",
            "youtube":"\uf167",
            "youtube-square":"\uf431",
            "zhihu":"\uf63f",
        }
    };
    return SplunkVisualizationBase.extend(vizObj);
});