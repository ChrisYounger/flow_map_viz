// TODO:
// Add arrow mode
// highlight link/nodes/labels on hover (dim particles and other links).

define([
    'api/SplunkVisualizationBase',
    'jquery',
    'd3',
    'pixi.js',
    'tinycolor2'
],
function(
    SplunkVisualizationBase,
    $,
    d3,
    PIXI,
    tinycolor
) {
    var vizObj = {
        initialize: function() {
            SplunkVisualizationBase.prototype.initialize.apply(this, arguments);
            var viz = this;
            viz.instance_id = "flow_map_viz-" + Math.round(Math.random() * 1000000);
            viz.instance_id_ctr = 0;
            viz.$container_wrap = $(viz.el);
            viz.$container_wrap.addClass("flow_map_viz-container");
            viz.seedRandom();
        },

        formatData: function(data) {
            return data;
        },

        updateView: function(data, config) {
            var viz = this;
            viz.scheduleDraw(data, config);
        },

        // debounce the draw
        scheduleDraw: function(data, config){
            var viz = this;
            clearTimeout(viz.drawtimeout);
            viz.drawtimeout = setTimeout(function(){
                viz.doDraw(data, config);
            }, 300);
        },

        doDraw: function(in_data, in_config) {
            var viz = this;
            var invalidRows = 0;
            var nodeOrder = 1;
            var nodesLoose = {};
            var pathParts;
            var i, j, k, l, attach;

            // Dont draw unless this is a real element under body
            if (! viz.$container_wrap.parents().is("body")) {
                //("aborting: not under html body");
                return;
            }
            // Container can have no height if it is in a panel that isnt yet visible on the dashboard.
            // I believe the container might also have no size in other situations too
            if (viz.$container_wrap.height() <= 0) {
                //console.log("not drawing becuase container has no height");
                if (!viz.hasOwnProperty("resizeWatcher")) {
                    viz.resizeWatcher = setInterval(function(){
                        if (viz.$container_wrap.height() > 0) {
                            clearInterval(viz.resizeWatcher);
                            delete viz.resizeWatcher;
                            viz.scheduleDraw(in_data, in_config);
                        }
                    }, 1000);
                }
                return;
            }
            if (viz.hasOwnProperty("resizeWatcher")) {
                clearInterval(viz.resizeWatcher);
                delete viz.resizeWatcher;
            }

            // in_data might be blank if the reflow method was called
            if (typeof in_data !== "undefined" && typeof in_config !== "undefined") {
                viz.data = in_data;
                viz.config = {
                    maxnodes: "100",
                    node_repel_force: "1000",
                    node_center_force: "0.1",
                    positions: "",
                    coarse_positions: "yes",
                    labels_as_html: "no",
                    background_mode: "custom",
                    background_color: "#ffffff",
                    new_labeling: "yes",
                    renderer: "webgl",
                    width: "",

                    link_speed: "90",
                    link_opacity: "0.5",
                    link_distance: "200",
                    link_width: "1",
                    link_color: "#cccccc",
                    link_label_color: "#000000",
                    link_text_size: "10",
                    line_style: "solid",

                    particle_limit: "60",
                    particle_domain: "",
                    particle_good_color: "#1a9035",
                    particle_warn_color: "#d16f18",
                    particle_error_color: "#b22b32",
                    particle_spread: "5",
                    particle_size: "3",
                    particle_blur: "0",
                    particle_slow: "",

                    node_width: "120",
                    node_height: "30",
                    node_bg_color: "#cccccc",
                    node_border_color: "#000000",
                    node_border_mode: "darker1",
                    node_border_width: "1",
                    node_shadow_mode: "custom",
                    node_shadow_color: "#000000",
                    node_text_color: "#000000",
                    node_text_size: "12",
                    node_radius: "2"
                };
                // Override defaults with selected items from the UI
                for (var opt in in_config) {
                    if (in_config.hasOwnProperty(opt)) {
                        viz.config[ opt.replace(viz.getPropertyNamespaceInfo().propertyNamespace,'') ] = in_config[opt];
                    }
                }
                $(window).off("resize.flow_map_viz").on("resize.flow_map_viz", function () {
                    viz.scheduleDraw(in_data, in_config);
                });
            }

            // Keep track of the container size the config used so we know if we need to redraw the whole page
            viz.config.containerHeight = viz.$container_wrap.height();
            viz.config.containerWidth = viz.$container_wrap.width();
            var serialised = JSON.stringify(viz.config);
            if (viz.alreadyDrawn !== serialised) {
                viz.doRemove();
                viz.alreadyDrawn = serialised;
            }
            // Manually defined width
            var widthDefined = Number(viz.config.width);
            if (widthDefined > 0) {
                viz.config.containerWidth = widthDefined;
                viz.$container_wrap.css("width", widthDefined + "px");
            } else {
                viz.$container_wrap.css("width","");
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
                viz.delayUntilParticles = 500;
                viz.isDragging = false;
                viz.activeParticles = [];
                viz.activeGenerators = [];
            }

            // loop through data
            for (l = 0; l < viz.data.results.length; l++) {
                // If it has "from" and "to" its a link (edge)
                if (viz.data.results[l].hasOwnProperty("from") && viz.data.results[l].hasOwnProperty("to") && viz.data.results[l].from !== "" && viz.data.results[l].to !== "") {
                    nodesLoose[viz.data.results[l].from] = nodeOrder++;
                    nodesLoose[viz.data.results[l].to] = nodeOrder++;
                    viz.newLink(viz.data.results[l].from, viz.data.results[l].to, viz.data.results[l], true, true);
                // If it doesnt have a "from" and a "to" but it has a "node" then its a node row
                } else if (viz.data.results[l].hasOwnProperty("node") && viz.data.results[l].node !== "") {
                    viz.newNode(viz.data.results[l].node, viz.data.results[l], nodeOrder++);
                // Can also be a path
                } else if (viz.data.results[l].hasOwnProperty("path") && viz.data.results[l].path !== "") {
                    pathParts = viz.data.results[l].path.split("---");
                    for (j = 0; j < pathParts.length; j++) {
                        // This is a bit confusing, but to better handle the case where a lookup table config is appended after
                        // some real data, we want to use the sort of from the nodes definition. It becomes a bit wierd if 
                        // only some nodes are defined and some arent. In any case if people really care they should supply the 
                        // node field "order" to explicity set the order.
                        nodesLoose[pathParts[j]] = 1000 + nodeOrder++;
                        if (j < (pathParts.length - 1)) {
                            viz.newLink(pathParts[j], pathParts[j+1], viz.data.results[l], (j === 0), ((j + 2) === pathParts.length));
                        }
                    }
                } else {
                    console.log("Skipping invalid row:", JSON.stringify(viz.data.results[l]));
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
            for (j = viz.nodeData.length - 1; j >= 0 ; j--){
                if (viz.drawIteration !== viz.nodeData[j].drawIteration) {
                    delete viz.nodeDataMap[viz.nodeData[j].id];
                    viz.nodeData.splice(j, 1);
                }
            }

            // count how many particles there are in total and determine attachment points
            viz.totalParticles = 0;
            for (k = viz.linkData.length - 1; k >= 0 ; k--) {
                if (viz.drawIteration !== viz.linkData[k].drawIteration) {
                    // link has been removed, stop particles 
                    viz.stopParticleGenerator(viz.linkData[k]);
                    viz.stopParticles(viz.linkData[k]);
                    delete viz.linkDataMap[viz.linkData[k].id];
                    viz.linkData.splice(k, 1);
                    continue;
                }
                var defaultLabel = (viz.linkData[k].good > 0 ? "Good: " + viz.linkData[k].good : "") + 
                    (viz.linkData[k].warn > 0 ? " Warn: " + viz.linkData[k].warn : "") + 
                    (viz.linkData[k].error > 0 ? " Error: " + viz.linkData[k].error : "");
                if (viz.linkData[k].tooltip === null) {
                    viz.linkData[k].tooltip = "[" + viz.linkData[k].source + "] to [" + viz.linkData[k].target + "]: " + defaultLabel;
                }
                if (viz.linkData[k].label === null) {
                    viz.linkData[k].label = defaultLabel;
                }
                viz.totalParticles = Math.max(viz.totalParticles, (viz.linkData[k].good + viz.linkData[k].warn + viz.linkData[k].error));

                // determine attachment point for source node
                viz.linkData[k].sx_mod = 0;
                viz.linkData[k].sy_mod = 0;
                attach = viz.linkData[k].sourcepoint.split(/([\+\-])/);
                if (attach[0] === "left") { 
                    viz.linkData[k].sx_mod = viz.nodeDataMap[viz.linkData[k].source].width / 2 * -1;
                } else if (attach[0] === "right") {
                    viz.linkData[k].sx_mod = viz.nodeDataMap[viz.linkData[k].source].width / 2;
                } else if (attach[0] === "top") {
                    viz.linkData[k].sy_mod = viz.nodeDataMap[viz.linkData[k].source].height / 2 * -1;
                } else if (attach[0] === "bottom") {
                    viz.linkData[k].sy_mod = viz.nodeDataMap[viz.linkData[k].source].height / 2;
                }
                if (attach.length === 3 && ! isNaN(attach[2])) {
                    if (attach[0] === "left" || attach[0] === "right") {
                        if (attach[1] === "+") {
                            viz.linkData[k].sy_mod = Number(attach[2]);
                        } else {
                            viz.linkData[k].sy_mod = (Number(attach[2]) * -1);
                        }
                    }
                    if (attach[0] === "top" || attach[0] === "bottom") {
                        if (attach[1] === "+") {
                            viz.linkData[k].sx_mod = Number(attach[2]);
                        } else {
                            viz.linkData[k].sx_mod = (Number(attach[2]) * -1);
                        }
                    }
                }
                // determine attachment point for target node
                viz.linkData[k].tx_mod = 0;
                viz.linkData[k].ty_mod = 0;
                attach = viz.linkData[k].targetpoint.split(/([\+\-])/);
                if (attach[0] === "left") {
                    viz.linkData[k].tx_mod = viz.nodeDataMap[viz.linkData[k].target].width / 2 * -1;
                } else if (attach[0] === "right") {
                    viz.linkData[k].tx_mod = viz.nodeDataMap[viz.linkData[k].target].width / 2;
                } else if (attach[0] === "top") {
                    viz.linkData[k].ty_mod = viz.nodeDataMap[viz.linkData[k].target].height / 2 * -1;
                } else if (attach[0] === "bottom") {
                    viz.linkData[k].ty_mod = viz.nodeDataMap[viz.linkData[k].target].height / 2;
                }
                if (attach.length === 3 && ! isNaN(attach[2])) {
                    if (attach[0] === "left" || attach[0] === "right") {
                        if (attach[1] === "+") {
                            viz.linkData[k].ty_mod = Number(attach[2]);
                        } else {
                            viz.linkData[k].ty_mod = (Number(attach[2]) * -1);
                        }
                    }
                    if (attach[0] === "top" || attach[0] === "bottom") {
                        if (attach[1] === "+") {
                            viz.linkData[k].tx_mod = Number(attach[2]);
                        } else {
                            viz.linkData[k].tx_mod = (Number(attach[2]) * -1);
                        }
                    }
                }
            }
            // Particle domain interpolation
            var particle_domain_parts = $.trim(viz.config.particle_domain).split(",");
            var particle_domain_min = 0;
            var particle_domain_max = viz.totalParticles;
            if (particle_domain_parts.length === 2 && ! isNaN(particle_domain_parts[0]) && $.trim(particle_domain_parts[0]) !== ""){
                particle_domain_min = Number(particle_domain_parts[0]);
            }
            if (particle_domain_parts.length === 2 && ! isNaN(particle_domain_parts[1]) && $.trim(particle_domain_parts[1]) !== ""){
                particle_domain_max = Number(particle_domain_parts[1]);
            } else if (particle_domain_parts.length === 1 && ! isNaN(particle_domain_parts[0]) && $.trim(particle_domain_parts[0]) !== "") {
                particle_domain_max = Number(particle_domain_parts[0]);
            }
            viz.particleMax = Number(viz.config.particle_limit);
            // If zero, hide all particles
            if (viz.particleMax === 0 || (particle_domain_max - particle_domain_min) === 0) {
                viz.particleMultiplier = 0;
            // If less than zero, don't scale. 
            } else if (viz.particleMax < 0) {
                viz.particleMultiplier = 1;
            } else {
                // linear interpolation
                viz.particleMultiplier = viz.particleMax / (particle_domain_max - particle_domain_min);
            }

            var particle_slow = Number(viz.config.particle_slow);
            if (viz.config.particle_slow !== "" && particle_slow > 0) {
                viz.particle_slow = 1 - (1 - Math.max(0,Math.min(1, (viz.totalParticles - particle_domain_min) / (particle_domain_max - particle_domain_min)))) * (Math.min(99, particle_slow) / 100);
            } else {
                viz.particle_slow = 1;
            }

            // Sort the lists back into the order it arrived
            viz.nodeData.sort(function(a,b) {
                return a.dataorder - b.dataorder;
            });

            if (invalidRows > 0) {
                console.log("Rows skipped because missing mandatory field: ", invalidRows);
            }

            // Data is missing a mandatory columns 
            if (viz.nodeData.length ===  0 && invalidRows > 0) {
                viz.doRemove();
                viz.$container_wrap.empty().append("<div class='flow_map_viz-bad_data'>Data is missing a mandatory columns ('from'/'to' OR 'path' ).<br /><a href='/app/flow_map_viz/documentation' target='_blank'>Click here for examples and documentation</a></div>");
                return;
            }

            // Too many nodes in data
            if (viz.nodeData.length > Number(viz.config.maxnodes)) {
                viz.doRemove();
                viz.$container_wrap.empty().append("<div class='flow_map_viz-bad_data'>Too many nodes in data (Total nodes:" + viz.nodeData.length + ", Limit: " + viz.config.maxnodes + "). The limit can be changed in the format menu. </div>");
                return;
            }
            // Add SVG to the page
            if (viz.drawIteration === 1) {
                if (viz.config.coarse_positions === "yes") {
                    viz.positionMultiplier = 100;
                } else {
                    viz.positionMultiplier = 1000;
                }
                viz.svg = d3.create("svg")
                    .attr("class", "flow_map_viz-svg")
                    .attr("width", viz.config.containerWidth + "px")
                    .attr("height", viz.config.containerHeight + "px")
                    .attr("viewBox", [0, 0, viz.config.containerWidth, viz.config.containerHeight]);
                if (viz.config.background_mode === "transparent") {
                    viz.$container_wrap.css("background-color", "");
                } else {
                    viz.$container_wrap.css("background-color", viz.config.background_color);
                }
                viz.$container_wrap.empty();
                if (viz.hasOwnProperty("timer")) {
                    viz.timer.stop(); 
                    if (viz.timer.hasOwnProperty("destroy")) {
                        viz.timer.destroy();
                    }
                }
                viz.$container_wrap.append(viz.svg.node());
                viz.$container_wrap.off("click.cleartokens").on("click.cleartokens", function(){
                    var tokens = ["flow_map_viz-label", "flow_map_viz-node", "flow_map_viz-type", "flow_map_viz-drilldown"];
                    var defaultTokenModel = splunkjs.mvc.Components.get('default');
                    var submittedTokenModel = splunkjs.mvc.Components.get('submitted');
                    for (var m = 0; m < tokens.length; m++) {
                        if (defaultTokenModel) {
                            defaultTokenModel.unset(tokens[m]);
                        }
                        if (submittedTokenModel) {
                            submittedTokenModel.unset(tokens[m]);
                        }
                    }
                    console.log("Tokens cleared");
                });

                // we use our own fallback to canvas instead of the pixi one
                if  (viz.config.renderer === "webgl" && PIXI.utils.isWebGLSupported()) {
                    viz.renderWebGL = true;
                    // store colors as hex numerics
                    viz.particleTypes = {
                        good:  +("0x" + tinycolor(viz.config.particle_good_color).toHex()),
                        warn:  +("0x" + tinycolor(viz.config.particle_warn_color).toHex()),
                        error: +("0x" + tinycolor(viz.config.particle_error_color).toHex()),
                    };

                    viz.app = new PIXI.Application({ antialias: true, transparent: true, width: viz.config.containerWidth, height: viz.config.containerHeight });
                    viz.$container_wrap.append( viz.app.view );
                    var gr = new PIXI.Graphics();
                    gr.beginFill(0xFFFFFF);
                    gr.lineStyle(0); // set the lineStyle to zero so the particles don't have an outline
                    gr.drawCircle(0, 0, viz.config.particle_size);
                    gr.endFill();
                    viz.particleTexture = viz.app.renderer.generateTexture(gr);
                    viz.stage = new PIXI.Container();
                    if (viz.config.particle_blur !== "0" && viz.config.particle_blur !== "") {
                        viz.stage.filters = [new PIXI.filters.BlurFilter(viz.config.particle_blur)];//
                    }
                    viz.app.stage.addChild(viz.stage);
                    viz.timer = viz.app.ticker.add(function(delta){
                        viz.updateWebGL();
                    });

                } else {
                    // store colors as strings
                    viz.particleTypes = {
                        good:  viz.config.particle_good_color,
                        warn:  viz.config.particle_warn_color,
                        error: viz.config.particle_error_color,
                    };
                    viz.canvas = d3.create("canvas")
                        .attr("class", "flow_map_viz-canvas")
                        .attr("width", viz.config.containerWidth)
                        .attr("height", viz.config.containerHeight);
                    viz.$container_wrap.append(viz.canvas.node());
                    viz.context = viz.canvas.node().getContext("2d");
                    viz.timer = d3.timer(function() {
                        viz.updateCanvas();
                    });
                }

                viz.nodeLayers = ["fg","bg"];

                // Add groups in the correct order for layering
                viz.bgNodeGroup = d3.create("div")
                    .style("font", viz.config.node_text_size + "px sans-serif")
                    .style("color", viz.config.node_text_color)
                    .attr("class", "flow_map_viz-bgnodelabels");
                viz.linkGroup = viz.svg.append("g")
                    .attr("stroke-opacity", viz.config.link_opacity)
                    .attr("stroke", "#cccccc") // set a default in case user sets an invalid color
                    .attr("class", "flow_map_viz-links");
                viz.linkLabelGroup = d3.create("div")
                    .style("font", viz.config.link_text_size + "px sans-serif")
                    .style("color", viz.config.link_label_color)
                    .attr("class", "flow_map_viz-linklabels" + (viz.config.new_labeling==="yes" ? " flow_map_viz-setwidth" : ""));
                viz.fgNodeGroup = d3.create("div")
                    .style("font", viz.config.node_text_size + "px sans-serif")
                    .style("color", viz.config.node_text_color)
                    .attr("class", "flow_map_viz-nodelabels");
                viz.$container_wrap.prepend(viz.bgNodeGroup.node());
                viz.$container_wrap.append(viz.linkLabelGroup.node(), viz.fgNodeGroup.node());

                // Add a button that allows copying the current positions to the clipboard
                viz.positionsButton = $("<span class='flow_map_viz-copylink btn-pill'><i class='far fa-clipboard'></i> Copy positions to clipboard</span>")
                    .appendTo(viz.$container_wrap)
                    .on("click", function(){
                        d3.event.stopPropagation();
                        viz.dumpPositions();
                    }).on("mouseover",function(){
                        viz.positionsButton.css({"opacity": "1"});
                    }).on("mouseout", function(){
                        clearTimeout(viz.positionsButtonTimeout);
                        viz.positionsButtonTimeout = setTimeout(function(){
                            viz.positionsButton.css("opacity",0);
                        }, 5000);
                    });

                /* Some custom HTML tooltips on the flowmap.  */
                viz.domTooltip = $("<div class='flow_map_viz-tooltip_wrap' style='top:-1000px;left:-1000px;'></div>").appendTo(viz.$container_wrap);
                viz.$container_wrap.on("mousemove", function(evt) {
                    var c_offset = viz.$container_wrap.offset();
                    var c_width = viz.$container_wrap.width();
                    var c_height = viz.$container_wrap.height();
                    var x = evt.pageX - c_offset.left;
                    var y = evt.pageY - c_offset.top;
                    var pos = {};
                    if (x < (c_width * 0.7)) {
                        pos.left = (x + 30) + "px";
                        pos.right = "";
                    } else { 
                        pos.right = (c_width - x + 30) + "px";
                        pos.left = "";
                    }
                    if (y < (c_height * 0.7)) {
                        pos.top = y + "px";
                        pos.bottom = "";
                    } else { 
                        pos.bottom = (c_height - y) + "px";
                        pos.top = "";
                    }
                    viz.domTooltip.css(pos);
                });
                
                /* When the HTML tooltip goes over an icon, set the contents of the hover window  */
                viz.$container_wrap.hoverIntent({
                    selector: ".flow_map_viz-nodeset, .flow_map_viz-linklabel",
                    over: function(){
                        viz.domTooltip.empty().append($("<div class='flow_map_viz-tooltip'></div>").append($(this).attr("data-flow_map_viz-tooltip")));
                    },
                    out: function(){
                        viz.domTooltip.empty();
                    }
                });

                // Apply forces
                // These are the forces that move to the center
                var forceLink = d3.forceLink([]).id(function(d) { return d.id; }).distance(function(d) { 
                    return Number(d.distance) + d.source.radius + d.target.radius;
                });
                var forceCharge = d3.forceManyBody().strength(Number(viz.config.node_repel_force) * -1);
                var forceX = d3.forceX(viz.config.containerWidth / 2).strength(Number(viz.config.node_center_force));
                var forceY = d3.forceY(viz.config.containerHeight / 2).strength(Number(viz.config.node_center_force));

                // Force testing playground: https://bl.ocks.org/steveharoz/8c3e2524079a8c440df60c1ab72b5d03
                viz.simulation = d3.forceSimulation([]) // initialise with empty set
                    .force("link", forceLink)
                    .force("charge", forceCharge)
                    .force('x', forceX)
                    .force('y', forceY)
                    .alphaTarget(0)
                    .on("tick", function() {
                        viz.updatePositions();
                    });
            }

            // set the inital positions of nodes. JSON structure takes precedence, then the data, otherwise center
            var xy,dataxy;
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
            viz.bgNodeData = []
            viz.fgNodeData = []
            for (i = 0; i < viz.nodeData.length; i++){
                // If the dashboard has updated the fx might already be set
                if (! viz.nodeData[i].hasOwnProperty("isPositioned")) {
                    viz.nodeData[i].isPositioned = true;
                    // Position in data takes preference over manual positioning
                    dataxy = viz.nodeData[i].position.split(",");
                    if (dataxy.length === 2 && ! isNaN(dataxy[0]) && ! isNaN(dataxy[1])) {
                        viz.nodeData[i].xperc = dataxy[0];
                        viz.nodeData[i].yperc = dataxy[1];
                    // Data xperc/yperc will be overridden by formatter option
                    } else if (viz.positions.hasOwnProperty(viz.nodeData[i].id)) {
                        xy = viz.positions[viz.nodeData[i].id].split(",");
                        viz.nodeData[i].xperc = xy[0];
                        viz.nodeData[i].yperc = xy[1];
                    } 
                    // set fixed positions if defined
                    if (viz.nodeData[i].xperc !== "" && ! isNaN(viz.nodeData[i].xperc)) {
                        viz.nodeData[i].fx = viz.nodeData[i].xperc / 100 * viz.config.containerWidth;
                    }
                    if (viz.nodeData[i].yperc !== "" && ! isNaN(viz.nodeData[i].yperc)) {
                        viz.nodeData[i].fy = viz.nodeData[i].yperc / 100 * viz.config.containerHeight;
                    } 
                    viz.nodeData[i].x = viz.config.containerWidth / 2;
                    viz.nodeData[i].y = viz.config.containerHeight / 2;
                }
                if (viz.nodeData[i].order < 0) {
                    viz.bgNodeData.push(viz.nodeData[i]);
                } else {
                    viz.fgNodeData.push(viz.nodeData[i]);
                }
            }

            for (var nodeLayerIdx = 0; nodeLayerIdx < viz.nodeLayers.length; nodeLayerIdx++) {
                
                viz[viz.nodeLayers[nodeLayerIdx] + "NodeSelection"] = viz[viz.nodeLayers[nodeLayerIdx] + "NodeGroup"]
                    .selectAll(".flow_map_viz-nodeset")
                    .data(viz[viz.nodeLayers[nodeLayerIdx] + "NodeData"], function(d){ return d.id; });
                
                viz[viz.nodeLayers[nodeLayerIdx] + "NodeSelection"].exit().remove();

                viz[viz.nodeLayers[nodeLayerIdx] + "NodeSelection"].enter()
                    .append("div")
                    .attr("class", "flow_map_viz-nodeset") 
                    // Remove fixed position on double click
                    .on("dblclick", function(d){ 
                        d.fx = null;
                        d.fy = null;
                    })
                    .call(function(selection){
                        // This element is a background behind font awesome icons. otherwise it doesnt look as 
                        // good when you can see particles behind the icons. Has no effect when background is 
                        // transparent
                        selection.filter(function(d){ return d.hasOwnProperty("icon") && d.icon !== ""; })
                            .append("div")
                            .attr("class", "flow_map_viz-nodeiconbg")
                            .style("background-color", viz.config.background_color);
                        selection.filter(function(d){ return d.hasOwnProperty("icon") && d.icon !== ""; })
                            .append("i")
                            .attr("class", "flow_map_viz-nodeicon")
                            .style("-webkit-text-stroke-width", viz.config.node_border_width + "px");
                        selection
                            .append("div")
                            .attr("class", "flow_map_viz-nodelabel");
                    })
                    .call(viz.drag(viz.simulation))
                    .on("click", function(d){
                        d3.event.stopPropagation();
                        var tokens = {
                            "flow_map_viz-label": d.label,
                            "flow_map_viz-node": d.id,
                            "flow_map_viz-type": "node",
                        };
                        if (d.hasOwnProperty("drilldown") && d.drilldown !== ""){
                            tokens["flow_map_viz-drilldown"] = d.drilldown;
                        }
                        viz.setTokens(tokens);
                    });

                // Reselect everything
                viz[viz.nodeLayers[nodeLayerIdx] + "NodeSelection"] = viz[viz.nodeLayers[nodeLayerIdx] + "NodeGroup"]
                    .selectAll(".flow_map_viz-nodeset");

                viz[viz.nodeLayers[nodeLayerIdx] + "NodeSelection"]
                    .attr("data-flow_map_viz-tooltip", function(d){ return d.hasOwnProperty("tooltip") && typeof d.tooltip !== "undefined" ? d.tooltip : d.id; })
                    .style("width", function(d){ return d.width + "px"; })
                    .style("height", function(d){ return d.height + "px"; })
                    .style("opacity", function(d){ return d.opacity; })
                    .style("z-index", function(d){ return Math.abs(d.order); })
                    .call(function(selection){
                        // set the label on all types
                        selection
                            .select(".flow_map_viz-nodelabel")
                            .style("transform", function(d){ return "translate(" + d.labelx + "px," + d.labely + "px)"; })
                            .html(function(d) { return viz.config.labels_as_html === "no" ? viz.escapeHtml(d.label) : d.label; });

                        // non icon types (there will be unexpected results if a node changes between an icon and nonicon dynamically)
                        selection
                            .filter(function(d){ return !(d.hasOwnProperty("icon") && d.icon !== "");})
                            .style("border", function(d){ 
                                if (viz.config.node_border_mode === "darker1") {
                                    return viz.config.node_border_width + "px solid " + tinycolor(d.color).darken(10).toString();
                                } else if (viz.config.node_border_mode === "darker2") {
                                    return viz.config.node_border_width + "px solid " + tinycolor(d.color).darken(20).toString();
                                }
                                return viz.config.node_border_width + "px solid " + viz.config.node_border_color;
                            })
                            .style("box-shadow", function(d){ return viz.getShadow(d); })
                            .style("border-radius", function(d){ return d.rx + "px"; })
                            .style("background-color", function(d){ return d.color; });

                        // icon types - as font awesome icons
                        selection
                            .filter(function(d){ return d.hasOwnProperty("icon") && d.icon !== ""; })
                            .select(".flow_map_viz-nodeiconbg")
                            .style("width", function(d){ return d.height + "px"; })
                            .style("height", function(d){ return d.height + "px"; })
                            .style("border-radius", function(d){ return d.height + "px"; });
                        selection
                            .filter(function(d){ return d.hasOwnProperty("icon") && d.icon !== ""; })
                            .select(".flow_map_viz-nodeicon")
                            .attr("class", function(d){ return "flow_map_viz-nodeicon " + (d.icon.indexOf(" ") === -1) ? "fas fa-" + d.icon : d.icon; })
                            .style("font-size", function(d){ return d.height + "px"; })
                            .style("color", function(d){ return d.color; })
                            .style("-webkit-text-stroke-color", function(d){ 
                                if (viz.config.node_border_mode === "darker1") {
                                    return tinycolor(d.color).darken(10).toString();
                                } else if (viz.config.node_border_mode === "darker2") {
                                    return tinycolor(d.color).darken(20).toString();
                                }
                                return viz.config.node_border_color;
                            })
                            .style("text-shadow", function(d){ return viz.getShadow(d); });

                    });
            }

            // Create the links (edges) as d3 objects
            viz.linkSelection = viz.linkGroup
                .selectAll("line")
                .data(viz.linkData, function(d){ return d.id; })
                .join("line");

            // reselect lines
            viz.linkSelection = viz.linkGroup
                .selectAll("line")
                    .attr("stroke", function(d){ return d.color; })
                    .attr("stroke-width", function(d){ return d.width; });

            if (viz.config.line_style === "ants") {
                viz.linkSelection
                    .attr("stroke-linecap", "butt")
                    .attr("stroke-dashoffset", function(d){ return d.width * 5; })
                    .attr("stroke-dasharray", function(d){ return (d.width * 3) + " " + (d.width * 2); })
                    .call(function(p) {  viz.antAnimate(p); });
            }

            // Create link labels
            viz.linkLabelSelection = viz.linkLabelGroup
                .selectAll(".flow_map_viz-linklabel")
                .data(viz.linkData, function(d){ return d.id; })
                .join("div")
                    .attr("class", "flow_map_viz-linklabel")
                    .style("visibility", "hidden")
                    .style("cursor", function(d){ return (d.hasOwnProperty("drilldown") && d.drilldown !== "") ? "pointer" : ""; })
                    .style("top", function(d){ return Number(d.labely) - (viz.config.link_text_size) + "px"; })
                    .attr("data-flow_map_viz-tooltip", function(d) { return d.tooltip; })
                    .style("text-shadow", function(d){
                        return "-1px -1px 0 " + viz.config.background_color + ", 1px -1px 0 " + viz.config.background_color + ", -1px 1px 0 " + viz.config.background_color + ", 1px 1px 0 " + viz.config.background_color;
                    })
                    .html(function(d) { return viz.config.labels_as_html === "no" ? viz.escapeHtml(d.label) : d.label; })
                    .each(function(d){
                        var node = this;
                        d.offsetWidth = node.offsetWidth;
                        if (viz.config.new_labeling!=="yes") {
                            node.classList.add("flow_map_viz-setwidth");
                            node.style.left =  Number(d.labelx) - 100 + "px";
                        }
                        node.style.visibility = "";
                    })
                    .on("click", function(d){
                        var tokens = {
                            "flow_map_viz-label": d.label,
                            "flow_map_viz-link": d.id,
                            "flow_map_viz-from": d.source.id,
                            "flow_map_viz-to": d.target.id,
                            "flow_map_viz-type": "link",
                        };
                        if (d.hasOwnProperty("drilldown") && d.drilldown !== ""){
                            tokens["flow_map_viz-drilldown"] = d.drilldown;
                        }
                        viz.setTokens(tokens);
                        if (tokens.hasOwnProperty("flow_map_viz-drilldown")) {
                            viz.drilldown({
                                action: SplunkVisualizationBase.FIELD_VALUE_DRILLDOWN,
                                data: tokens
                            }, d3.event);
                        }
                    });

            viz.startParticlesSoon();

            // trigger force layout
            viz.simulation.nodes(viz.nodeData);
            viz.simulation.force("link").links(viz.linkData);
            viz.updatePositions();
            viz.simulation.alpha(0.3).restart();
        },

        startParticlesSoon: function(){
            var viz = this;
            clearTimeout(viz.startParticlesTimeout);
            viz.startParticlesTimeout = setTimeout(function(){
                viz.startParticles();
                // In another 2 seconds, redo the particles, becuase they might have floated a bit
                clearTimeout(viz.startParticlesTimeout);
                viz.startParticlesTimeout = setTimeout(function(){
                    viz.startParticles();
                }, 2000);
            }, viz.delayUntilParticles);
        },

        setTokens: function(tokens) {
            var defaultTokenModel = splunkjs.mvc.Components.get('default');
            var submittedTokenModel = splunkjs.mvc.Components.get('submitted');
            for (var token_name in tokens) {
                if (tokens.hasOwnProperty(token_name)) {
                    console.log("Setting token $" + token_name + "$ to \"" + tokens[token_name] + "\"");
                    if (defaultTokenModel) {
                        defaultTokenModel.set(token_name, tokens[token_name]);
                    }
                    if (submittedTokenModel) {
                        submittedTokenModel.set(token_name, tokens[token_name]);
                    }
                }
            }
        },

        // read a row of input data and put it into a normalisaed object
        newNode: function(id, opts, dataorder){
            var viz = this;
            if (! viz.nodeDataMap.hasOwnProperty(id)){
                viz.nodeDataMap[id] = {};
                viz.nodeData.push(viz.nodeDataMap[id]);
            }
            // if the node has already been updated this run then dont update it again (i.e. its a loose node)
            if (viz.nodeDataMap[id].drawIteration === viz.drawIteration) {
                return;
            }
            // It doesnt make sense for a "node" row to be specified multiple times
            viz.nodeDataMap[id].id = id;
            viz.nodeDataMap[id].drawIteration = viz.drawIteration;
            viz.nodeDataMap[id].dataorder = dataorder;
            viz.nodeDataMap[id].label = opts.hasOwnProperty("label") ? opts.label : id;
            viz.nodeDataMap[id].labelx = opts.hasOwnProperty("labelx") && opts.labelx !== "" ? opts.labelx : "0";
            viz.nodeDataMap[id].labely = opts.hasOwnProperty("labely") && opts.labelx !== "" ? opts.labely : "0";
            viz.nodeDataMap[id].height = opts.hasOwnProperty("height") && opts.height !== "" ? Number(opts.height) : Number(viz.config.node_height);
            viz.nodeDataMap[id].width = opts.hasOwnProperty("width") && opts.width !== "" ? Number(opts.width) : Number(viz.config.node_width);
            viz.nodeDataMap[id].color = opts.hasOwnProperty("color") && opts.color !== "" ? opts.color : viz.config.node_bg_color;
            viz.nodeDataMap[id].rx = opts.hasOwnProperty("radius") && opts.radius !== "" ? opts.radius : viz.config.node_radius;
            viz.nodeDataMap[id].opacity = opts.hasOwnProperty("opacity") ? opts.opacity : "";
            viz.nodeDataMap[id].position = opts.hasOwnProperty("position") ? opts.position : "";
            viz.nodeDataMap[id].icon = opts.hasOwnProperty("icon") ? opts.icon : "";
            viz.nodeDataMap[id].drilldown = opts.hasOwnProperty("drilldown") ? opts.drilldown : "";
            viz.nodeDataMap[id].order = opts.hasOwnProperty("order") && opts.order !== "" ? opts.order : "50";
            viz.nodeDataMap[id].tooltip = opts.hasOwnProperty("tooltip") && typeof opts.tooltip !== "undefined" ? opts.tooltip : viz.nodeDataMap[id].tooltip;

            // Check numeric values are actually numeric
            if (isNaN(viz.nodeDataMap[id].labelx)) {
                viz.nodeDataMap[id].labelx = "0";
            }
            if (isNaN(viz.nodeDataMap[id].labely)) {
                viz.nodeDataMap[id].labely = "0";
            }
            if (isNaN(viz.nodeDataMap[id].height)) {
                viz.nodeDataMap[id].height = 30;
            }
            if (isNaN(viz.nodeDataMap[id].width)) {
                viz.nodeDataMap[id].width = 120;
            }
            if (isNaN(viz.nodeDataMap[id].rx)) {
                viz.nodeDataMap[id].rx = "2";
            }
            if (isNaN(viz.nodeDataMap[id].order)) {
                viz.nodeDataMap[id].order = "50";
            }
            if (isNaN(viz.nodeDataMap[id].opacity)) {
                viz.nodeDataMap[id].opacity = "";
            }
            if (isNaN(viz.nodeDataMap[id].xperc)) {
                viz.nodeDataMap[id].xperc = "";
            }
            if (isNaN(viz.nodeDataMap[id].yperc)) {
                viz.nodeDataMap[id].yperc = "";
            }

            viz.nodeDataMap[id].radius = Math.min(viz.nodeDataMap[id].height/2, viz.nodeDataMap[id].width/2) + Number(viz.config.node_border_width) + 1;
        },

        newLink: function(from, to, opts, isFromLink, isToLink){
            var viz = this;
            var id = from + "---" + to;
            // First time seeing this data
            if (! viz.linkDataMap.hasOwnProperty(id)){
                viz.linkDataMap[id] = {
                    timeouts: {},
                    drawIteration: -1,
                };
                viz.linkData.push(viz.linkDataMap[id]);
            }
            // A link can occur multiple times in the data. More common in "path" style data definitions
            if (viz.linkDataMap[id].drawIteration !== viz.drawIteration) {
                // These cant change
                viz.linkDataMap[id].id = id;
                viz.linkDataMap[id].drawIteration = viz.drawIteration;
                viz.linkDataMap[id].source = from;
                viz.linkDataMap[id].target = to;
                // Set default values
                viz.linkDataMap[id].good = 0;
                viz.linkDataMap[id].warn = 0;
                viz.linkDataMap[id].error = 0;
                viz.linkDataMap[id].color = viz.config.link_color;
                viz.linkDataMap[id].width = viz.config.link_width;
                viz.linkDataMap[id].distance = viz.config.link_distance;
                viz.linkDataMap[id].speed = viz.config.link_speed;
                viz.linkDataMap[id].labelx = "0";
                viz.linkDataMap[id].labely = "0";
                viz.linkDataMap[id].sourcepoint = "";
                viz.linkDataMap[id].targetpoint = "";
                viz.linkDataMap[id].drilldown = "";
                viz.linkDataMap[id].tooltip = null;
                viz.linkDataMap[id].label = null;
            }
            // If the link occurs multiple times in data, the good, warn, error values are summed together 
            viz.linkDataMap[id].good += opts.hasOwnProperty("good") && ! isNaN(opts.good) ? Number(opts.good) : 0;
            viz.linkDataMap[id].warn += opts.hasOwnProperty("warn") && ! isNaN(opts.warn) ? Number(opts.warn) : 0;
            viz.linkDataMap[id].error += opts.hasOwnProperty("error") && ! isNaN(opts.error) ? Number(opts.error) : 0;
            // These settings will only set the value if set in data. In case the same value is set multiple times, the last value will take effect
            viz.linkDataMap[id].color = opts.hasOwnProperty("color") ? opts.color : viz.linkDataMap[id].color;
            viz.linkDataMap[id].width = opts.hasOwnProperty("width") ? opts.width : viz.linkDataMap[id].width;
            viz.linkDataMap[id].distance = opts.hasOwnProperty("distance") ? opts.distance : viz.linkDataMap[id].distance;
            viz.linkDataMap[id].speed = opts.hasOwnProperty("speed") ? opts.speed : viz.linkDataMap[id].speed;
            viz.linkDataMap[id].labelx = opts.hasOwnProperty("labelx") && opts.labelx !== "" ? opts.labelx : viz.linkDataMap[id].labelx;
            viz.linkDataMap[id].labely = opts.hasOwnProperty("labely") && opts.labely !== "" ? opts.labely : viz.linkDataMap[id].labely;
            viz.linkDataMap[id].sourcepoint = isFromLink && opts.hasOwnProperty("fromside") ? opts.fromside : viz.linkDataMap[id].sourcepoint;
            viz.linkDataMap[id].targetpoint = isToLink && opts.hasOwnProperty("toside") ? opts.toside : viz.linkDataMap[id].targetpoint;
            viz.linkDataMap[id].drilldown = opts.hasOwnProperty("drilldown") ? opts.drilldown : viz.linkDataMap[id].drilldown;
            viz.linkDataMap[id].tooltip = opts.hasOwnProperty("tooltip") ? opts.tooltip : viz.linkDataMap[id].tooltip;
            viz.linkDataMap[id].label = opts.hasOwnProperty("label") ? opts.label : viz.linkDataMap[id].label;

            // Check numeric values are actually numeric
            if (isNaN(viz.linkDataMap[id].width)) {
                viz.linkDataMap[id].width = "1";
            }
            if (isNaN(viz.linkDataMap[id].distance)) {
                viz.linkDataMap[id].distance = "200";
            }
            if (isNaN(viz.linkDataMap[id].speed)) {
                viz.linkDataMap[id].speed = "90";
            }
            if (isNaN(viz.linkDataMap[id].labelx)) {
                viz.linkDataMap[id].labelx = "0";
            }
            if (isNaN(viz.linkDataMap[id].labely)) {
                viz.linkDataMap[id].labely = "0";
            }
        },

        // Add hander for dragging. Anything dragged will get a fixed position
        drag: function(simulation) {
            var viz = this;
            return d3.drag()
                .on("start", function(d) {
                    if (viz.renderWebGL) {
                        for (var i = 0; i < viz.activeParticles.length; i++) {
                            viz.activeParticles[i].sprite.destroy();
                        }
                    }
                    viz.activeParticles = [];
                    viz.stopAllParticles();
                    viz.isDragging = true;
                    if (!d3.event.active) simulation.alphaTarget(0.3).restart();
                    d.fx = d.x;
                    d.fy = d.y;
                })
                .on("drag", function(d) {
                    d.fx = Math.round(d3.event.x / viz.config.containerWidth * viz.positionMultiplier) / viz.positionMultiplier * viz.config.containerWidth;
                    d.fy = Math.round(d3.event.y / viz.config.containerHeight * viz.positionMultiplier) / viz.positionMultiplier * viz.config.containerHeight;
                })
                .on("end", function(d) {
                    viz.isDragging = false;
                    viz.positions[d.id] = "" + (Math.round(d.fx / viz.config.containerWidth * viz.positionMultiplier) / (viz.positionMultiplier / 100)) + "," + (Math.round(d.fy / viz.config.containerHeight * viz.positionMultiplier) / (viz.positionMultiplier / 100));
                    // restart particles again
                    viz.startParticlesSoon();
                    if (!d3.event.active) simulation.alphaTarget(0);
                    viz.positionsButton.css("opacity",1);
                    clearTimeout(viz.positionsButtonTimeout);
                    viz.positionsButtonTimeout = setTimeout(function(){
                        viz.positionsButton.css("opacity",0);
                    }, 10000);
                });
        },

        updatePositions: function() {
            var viz = this;
            for (var nodeLayerIdx = 0; nodeLayerIdx < viz.nodeLayers.length; nodeLayerIdx++) {
                // When stuff is dragged, or when the forces are being simulated, move items
                viz[viz.nodeLayers[nodeLayerIdx] + "NodeSelection"]
                    .style("transform", function(d) {
                        // Prevent stuff going outside view. d.x and d.y are midpoints so stuff can still half go outside the canvas
                        if (isNaN(d.width)) {console.log("there is no d.width on tick", d); return; }
                        d.x = Math.max(d.radius, Math.min(viz.config.containerWidth - d.radius, d.x));
                        d.y = Math.max(d.radius, Math.min(viz.config.containerHeight - d.radius, d.y));
                        // 5 is the padding
                        return "translate(" + (d.x - d.width * 0.5 - 5) + "px," + (d.y - d.height * 0.5 - 5) + "px)";
                    });
            }

            viz.linkSelection
                .attr("x1", function(d){ d.sx = (d.source.x || 0) + d.sx_mod; return d.sx; })
                .attr("y1", function(d){ d.sy = (d.source.y || 0) + d.sy_mod; return d.sy; })
                .attr("x2", function(d){ d.tx = (d.target.x || 0) + d.tx_mod; return d.tx; })
                .attr("y2", function(d){ d.ty = (d.target.y || 0) + d.ty_mod; return d.ty; });

            viz.linkLabelSelection
                .style("transform", function(d) {
                    var minx = Math.min(d.sx, d.tx);
                    var maxx = Math.max(d.sx, d.tx);
                    var miny = Math.min(d.sy, d.ty);
                    var maxy = Math.max(d.sy, d.ty);
                    if (viz.config.new_labeling==="yes") {
                        return "translate(" + (((maxx - minx) * 0.5 + minx) + (Number(d.labelx) - (d.offsetWidth/2))) + "px," + ((maxy - miny) * 0.5 + miny - (viz.config.link_text_size * 0.3)) + "px)";
                    }
                    return "translate(" + ((maxx - minx) * 0.5 + minx) + "px," + ((maxy - miny) * 0.5 + miny - (viz.config.link_text_size * 0.3)) + "px)";
                });
        },

        // Write the current position of elements to the console
        dumpPositions: function(){
            var viz = this;
            var dump = JSON.stringify(viz.positions);
            console.log(dump.substr(1,dump.length-2));
            viz.copyTextToClipboard(dump.substr(1,dump.length-2));
            
            // Trying to find a hack way to set the positions, without needing to copy to clipboard. WIP
            // viz.$container_wrap.parents(".dashboard-element.viz").find(".icon-paintbrush").click();
            // setTimeout(function(){
            //     console.log($(".shared-vizcontrols-format-dialog.open li:nth-child(4) a").eq(0));
            //     $(".shared-vizcontrols-format-dialog.open li:nth-child(4) a").eq(0).click();
            //     $(".shared-vizcontrols-format-dialog.open li:nth-child(4) a").eq(0).click();
            //     $("[name=\"display.visualizations.custom.flow_map_viz.flow_map_viz.positions\"] input").val("hi!")
            // },3000); 

        },

        startParticles: function() {
            var viz = this;
            viz.stopAllParticles();
            if (viz.particleMultiplier === 0) {
                return;
            }
            for (var i = 0; i < viz.linkData.length; i++) {
                for (var particletype in viz.particleTypes) {
                    if (viz.particleTypes.hasOwnProperty(particletype)) {
                        viz.startParticleGroup(viz.linkData[i], particletype);
                    }
                }
            }
        },

        // Create circle particle creator, 
        // Each link can have three of these for good/warn/error particles
        startParticleGroup: function(link_details, particletype) {
            var viz = this;
            // No particles of this type
            if (link_details[particletype] <= 0) {
                return;
            }
            // calculate distance between two points
            var distance = Math.sqrt(Math.pow((link_details.tx) - (link_details.sx), 2) + 
                                     Math.pow((link_details.ty) - (link_details.sy), 2));

            // The duration needs to also consider the length of the line (ms per pixel)
            var base_time = distance * (101 - Math.max(1, Math.min(100, (viz.particle_slow * Number(link_details.speed)))));

            // add some jitter to the starting position
            var base_jitter = (Number(viz.config.particle_spread) < 0 ? link_details.width : viz.config.particle_spread);
            base_jitter = Number(base_jitter);
            var particle_dispatch_delay = (1000 / (link_details[particletype] * viz.particleMultiplier * viz.particle_slow));
            // randomise the time until the first particle, otherwise multiple nodes will move in step which doesnt look as good
            link_details.timeouts[particletype] = setTimeout(function(){
                viz.activeGenerators.push({
                    //start: null,
                    id: link_details.id,
                    interval: particle_dispatch_delay,
                    base_jitter: base_jitter,
                    base_time: base_time,
                    link_details: link_details,
                    color: viz.particleTypes[particletype],
                });
            }, (Math.random() * particle_dispatch_delay));
        },

        // check all particle generators and see if any new particles need to spawn
        spawnNewParticles: function(now) { 
            var i,g,jitter1,jitter2;
            var viz = this;
            if (viz.isDragging) { return; }
            for (i = 0; i < viz.activeGenerators.length; i++) {
                g = viz.activeGenerators[i];
                if (! g.hasOwnProperty("start") || (g.start + g.interval) < now) {
                    // may start multiple particles if the max is larger than the refresh rate (60FPS)
                    if (g.link_details.hasOwnProperty("sx")) {
                        // 16 ms in 60 frames/sec
                        var extras = Math.ceil(16.7 / g.interval);
                        for (var j = 0; j < extras; j++) {
                            g.start = now;
                            jitter1 = Math.ceil(g.base_jitter * viz.getRandom()) - (g.base_jitter / 2);
                            jitter2 = Math.ceil(g.base_jitter * viz.getRandom()) - (g.base_jitter / 2);
                            viz.activeParticles.push({
                                sx: (jitter1 + g.link_details.sx),
                                sy: (jitter2 + g.link_details.sy),
                                tx: (jitter1 + g.link_details.tx),
                                ty: (jitter2 + g.link_details.ty),
                                color: g.color,
                                duration: g.base_time + ((viz.getRandom() * g.base_time * 0.4) - g.base_time * 0.2)
                            });
                        }
                    }
                }
            }
        },

        // prepopulate 1 million random numbers becuase it makes it quicker later
        seedRandom: function() {
            var viz = this;
            viz.randoms = [];
            viz.randoms_idx = 1;
            for (var i=1e6; i--;) {
                viz.randoms.push(Math.random());
            }
        },

        getRandom: function() {
            var viz = this;
            return ++viz.randoms_idx >= viz.randoms.length ? viz.randoms[viz.randoms_idx=0] : viz.randoms[viz.randoms_idx];
        },

        updateWebGL: function(){
            var viz = this;
            var now = (new Date).getTime();
            var i,p,t;

            viz.spawnNewParticles(now);

            for (i = viz.activeParticles.length - 1; i >= 0; i--) {
                p = viz.activeParticles[i];
                // if the start key doesnt exist, then the particle must have just spawned
                if (! p.hasOwnProperty("start")) {
                    p.start = now;
                    p.sprite = PIXI.Sprite.from(viz.particleTexture);
                    p.sprite.anchor.set(0.5);
                    p.sprite.tint = p.color;
                    viz.stage.addChild(p.sprite);
                }
                t = ((now - p.start) / p.duration);
                // if particle is not yet at the target
                if (t < 1) {
                    p.sprite.x = Math.floor(p.sx * (1 - t) + p.tx * t);
                    p.sprite.y = Math.floor(p.sy * (1 - t) + p.ty * t);

                } else {
                    // particle has reached target
                    p.sprite.destroy();
                    viz.activeParticles.splice(i, 1);
                }
            }
        },

        updateCanvas: function() {
            var viz = this;
            var now = (new Date).getTime();
            var i,x,y,p,t;
            viz.spawnNewParticles(now);
            // This could be optimised to only clear a line of pixels between the start and end point 
            // instead of doing a clearRect on the whole canvas. however this wouldnt be a huge benefit
            viz.context.clearRect(0, 0, viz.config.containerWidth, viz.config.containerHeight);
            for (i = viz.activeParticles.length - 1; i >= 0; i--) {
                p = viz.activeParticles[i];
                if (! p.hasOwnProperty("start")) {
                    p.start = now;
                }
                t = ((now - p.start) / p.duration);
                // if particle is not yet at the target
                if (t < 1) {
                    x = Math.floor(p.sx * (1 - t) + p.tx * t);
                    y = Math.floor(p.sy * (1 - t) + p.ty * t);
                    viz.context.beginPath();
                    if (viz.config.particle_blur !== "0") {
                        viz.context.shadowColor = p.color;
                        viz.context.shadowBlur = viz.config.particle_blur;
                        viz.context.shadowOffsetX = 0;
                        viz.context.shadowOffsetY = 0;
                    }
                    viz.context.moveTo(x + viz.config.particle_size, y);
                    viz.context.arc(x, y, viz.config.particle_size, 0, 2 * Math.PI);
                    viz.context.fillStyle = p.color;
                    viz.context.fill();
                } else {
                    // particle has reached target
                    viz.activeParticles.splice(i, 1);
                }
            }
        },

        stopAllParticles: function() {
            var viz = this;
            viz.activeGenerators = [];
            if (viz.hasOwnProperty("linkData")) {
                for (var i = 0; i < viz.linkData.length; i++) {
                    viz.stopParticles(viz.linkData[i]);
                }
            }
        },

        stopParticleGenerator: function(link_details){
            var viz = this;
            for (var i = viz.activeGenerators.length - 1; i >= 0; i--) {
                if (viz.activeGenerators[i].id === link_details.id) {
                    viz.activeGenerators.splice(i, 1);
                }
            }
        }, 

        stopParticles: function(link_details) {
            var viz = this;
            for (var particletype in viz.particleTypes) {
                if (viz.particleTypes.hasOwnProperty(particletype)) {
                    clearTimeout(link_details.timeouts[particletype]);
                }
            }
        },

        doRemove: function(){
            var viz = this;
            delete viz.drawIteration;
            viz.stopAllParticles();
        },

        antAnimate: function(path) {
            var viz = this;
            path.filter(function(d){ return Number(d.speed) !== 0; })
                .transition()
                .duration(function(d){ return 100 * (101 - Math.max(1, Math.min(100, Number(d.speed)))); })
                .ease(d3.easeLinear)
                .attr("stroke-dashoffset", "0")
                .on("end", function() { 
                    d3.select(this)
                        .attr("stroke-dashoffset", function(d) { return (d.width * 5); })
                        .call(function(p) { viz.antAnimate(p); });
                });
        },

        getShadow: function(d) {
            var viz = this;
            var clr = "";
            if (viz.config.node_shadow_mode === "disabled"){
                return null;
            } else if (viz.config.node_shadow_mode === "darker1"){
                clr = tinycolor(d.color).darken(10).toString();
            } else if (viz.config.node_shadow_mode === "darker2"){
                clr = tinycolor(d.color).darken(20).toString();
            } else {
                clr = viz.config.node_shadow_color;
            }
            return "0 3px 6px " + tinycolor(clr).setAlpha(0.16).toRgbString() + ", 0 3px 6px " + tinycolor(clr).setAlpha(0.23).toRgbString();
        },

        copyTextToClipboard: function(text) {
            var viz = this;
            if (!navigator.clipboard) {
                viz.fallbackCopyTextToClipboard(text);
            } else {
                navigator.clipboard.writeText(text).then(function() {
                    viz.toast('Copied to clipboard! (now paste into Visualization settings/Advanced)');
                }, function (err) {
                    console.error('Async: Could not copy node positions to clipboard. Please hit F12 and check the console log for the positions string. This should be pasted into the Advanced settings.', err);
                });
            }
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
                if (successful) {
                    viz.toast('Copied to clipboard! (now paste into Visualization settings/Advanced)');
                } else {
                    console.error('Fallback2: Could not copy node positions to clipboard. Please hit F12 and check the console log for the positions string. This should be pasted into the Advanced settings.', err);
                }
            } catch (err) {
                console.error('Fallback: Could not copy node positions to clipboard. Please hit F12 and check the console log for the positions string. This should be pasted into the Advanced settings.', err);
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
        
        escapeHtml: function(unsafe) {
            return unsafe
                .replace(/&/g, "&amp;")
                .replace(/</g, "&lt;")
                .replace(/>/g, "&gt;")
                .replace(/"/g, "&quot;")
                .replace(/'/g, "&#039;");
        },

        // Override to respond to re-sizing events
        reflow: function() {
            var viz = this;
            if (viz.hasOwnProperty("config")) { 
                viz.scheduleDraw();
            }
        },

        // Called when removed. This happens if using the viz not in a dashboard, and you rerun search
        remove: function(){
            var viz = this;
            viz.stopAllParticles();
            if (viz.hasOwnProperty("timer")) {
                viz.timer.stop(); 
            }
            viz.$container_wrap.empty();
        },

        // Search data params
        getInitialDataParams: function() {
            return ({
                outputMode: SplunkVisualizationBase.RAW_OUTPUT_MODE,
                count: 10000
            });
        },
    };



/*!
 * hoverIntent v1.10.1 // 2019.10.05 // jQuery v1.7.0+
 * http://briancherne.github.io/jquery-hoverIntent/
 *
 * You may use hoverIntent under the terms of the MIT license. Basically that
 * means you are free to use hoverIntent as long as this header is left intact.
 * Copyright 2007-2019 Brian Cherne
 */
!function(factory){"use strict";"function"==typeof define&&define.amd?define(["jquery"],factory):"object"==typeof module&&module.exports?module.exports=factory(require("jquery")):jQuery&&!jQuery.fn.hoverIntent&&factory(jQuery)}(function($){"use strict";function track(ev){cX=ev.pageX,cY=ev.pageY}var cX,cY,_cfg={interval:100,sensitivity:6,timeout:0},INSTANCE_COUNT=0,compare=function(ev,$el,s,cfg){if(Math.sqrt((s.pX-cX)*(s.pX-cX)+(s.pY-cY)*(s.pY-cY))<cfg.sensitivity)return $el.off(s.event,track),delete s.timeoutId,s.isActive=!0,ev.pageX=cX,ev.pageY=cY,delete s.pX,delete s.pY,cfg.over.apply($el[0],[ev]);s.pX=cX,s.pY=cY,s.timeoutId=setTimeout(function(){compare(ev,$el,s,cfg)},cfg.interval)};$.fn.hoverIntent=function(handlerIn,handlerOut,selector){var instanceId=INSTANCE_COUNT++,cfg=$.extend({},_cfg);$.isPlainObject(handlerIn)?(cfg=$.extend(cfg,handlerIn),$.isFunction(cfg.out)||(cfg.out=cfg.over)):cfg=$.isFunction(handlerOut)?$.extend(cfg,{over:handlerIn,out:handlerOut,selector:selector}):$.extend(cfg,{over:handlerIn,out:handlerIn,selector:handlerOut});function handleHover(e){var ev=$.extend({},e),$el=$(this),hoverIntentData=$el.data("hoverIntent");hoverIntentData||$el.data("hoverIntent",hoverIntentData={});var state=hoverIntentData[instanceId];state||(hoverIntentData[instanceId]=state={id:instanceId}),state.timeoutId&&(state.timeoutId=clearTimeout(state.timeoutId));var mousemove=state.event="mousemove.hoverIntent.hoverIntent"+instanceId;if("mouseenter"===e.type){if(state.isActive)return;state.pX=ev.pageX,state.pY=ev.pageY,$el.off(mousemove,track).on(mousemove,track),state.timeoutId=setTimeout(function(){compare(ev,$el,state,cfg)},cfg.interval)}else{if(!state.isActive)return;$el.off(mousemove,track),state.timeoutId=setTimeout(function(){!function(ev,$el,s,out){var data=$el.data("hoverIntent");data&&delete data[s.id],out.apply($el[0],[ev])}(ev,$el,state,cfg.out)},cfg.timeout)}}return this.on({"mouseenter.hoverIntent":handleHover,"mouseleave.hoverIntent":handleHover},cfg.selector)}});


    return SplunkVisualizationBase.extend(vizObj);
});