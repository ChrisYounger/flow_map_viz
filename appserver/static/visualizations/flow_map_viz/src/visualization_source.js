// TODO:
// Add arrow mode
// highlight link/nodes/labels on hover (dim particles and other links).

define([
    'api/SplunkVisualizationBase',
    'jquery',
    'd3',
    'pixi.js'
],
function(
    SplunkVisualizationBase,
    $,
    d3,
    PIXI
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
            if (viz.$container_wrap.height() <= 0) {
                //console.log("aborting: container has no height");
                return;
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

                // Add groups in the correct order for layering
                viz.linkGroup = viz.svg.append("g")
                    .attr("stroke-opacity", viz.config.link_opacity)
                    .attr("stroke", "#cccccc") // set a default in case user sets an invalid color
                    .attr("class", "flow_map_viz-links");
                viz.linkLabelGroup = d3.create("div")
                    .style("font", viz.config.link_text_size + "px sans-serif")
                    .style("color", viz.config.link_label_color)
                    .attr("class", "flow_map_viz-linklabels" + (viz.config.new_labeling==="yes" ? " flow_map_viz-setwidth" : ""));
                viz.nodeGroup = d3.create("div")
                    .style("font", viz.config.node_text_size + "px sans-serif")
                    .style("color", viz.config.node_text_color)
                    .attr("class", "flow_map_viz-nodelabels");
                viz.$container_wrap.append(viz.linkLabelGroup.node(), viz.nodeGroup.node());

                // Add a button that allows copying the current positions to the clipboard
                viz.positionsButton = $("<span class='flow_map_viz-copylink btn-pill'><i class='far fa-clipboard'></i> Copy positions to clipboard</span>")
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
                    .force('y',  forceY)
                    .alphaTarget(0)
                    .on("tick", function() {
                        viz.updatePositions();
                    });
            }

            // Stop the simulation while stuff is added/removed
            //viz.simulation.alphaTarget(0);

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
            }

            viz.nodeSelection = viz.nodeGroup
                .selectAll(".flow_map_viz-nodeset")
                .data(viz.nodeData, function(d){ return d.id; });

            viz.nodeSelection.exit().remove();

            viz.nodeSelection.enter()
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
            viz.nodeSelection = viz.nodeGroup
                .selectAll(".flow_map_viz-nodeset");

            viz.nodeSelection
                .attr("title", function(d){ return d.id; })
                .style("width", function(d){ return d.width + "px"; })
                .style("height", function(d){ return d.height + "px"; })
                .style("opacity", function(d){ return d.opacity; })
                .style("z-index", function(d){ return d.order; })
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
                        .attr("class", function(d){ return (d.icon.indexOf(" ") === -1) ? "fas fa-" + d.icon : d.icon; })
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
                    .attr("title", function(d) { return d.tooltip; })
                    .style("text-shadow", function(d){
                        return "-1px -1px 0 " + viz.config.background_color + ", 1px -1px 0 " + viz.config.background_color + ", -1px 1px 0 " + viz.config.background_color + ", 1px 1px 0 " + viz.config.background_color;
                    })
                    .html(function(d) { return d.label; })
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
                // In another 5 seconds, redo the particles, becuase they might have floated a bit
                clearTimeout(viz.startParticlesTimeout);
                viz.startParticlesTimeout = setTimeout(function(){
                    viz.startParticles();
                }, 5000);
            }, viz.delayUntilParticles);
        },

        setTokens: function(tokens) {
            var defaultTokenModel = splunkjs.mvc.Components.get('default', {create: true});
            var submittedTokenModel = splunkjs.mvc.Components.get('submitted', {create: true});
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
            // When stuff is dragged, or when the forces are being simulated, move items
            viz.nodeSelection
                .style("transform", function(d) {
                    // Prevent stuff going outside view. d.x and d.y are midpoints so stuff can still half go outside the canvas
                    if (isNaN(d.width)) {console.log("there is no d.width on tick", d); return; }
                    d.x = Math.max(d.radius, Math.min(viz.config.containerWidth - d.radius, d.x));
                    d.y = Math.max(d.radius, Math.min(viz.config.containerHeight - d.radius, d.y));
                    // 5 is the padding
                    return "translate(" + (d.x - d.width * 0.5 - 5) + "px," + (d.y - d.height * 0.5 - 5) + "px)";
                });

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
            var base_time = distance * (101 - Math.max(1, Math.min(100, Number(link_details.speed))));
            // add some jitter to the starting position
            var base_jitter = (Number(viz.config.particle_spread) < 0 ? link_details.width : viz.config.particle_spread);
            base_jitter = Number(base_jitter);
            var particle_dispatch_delay = (1000 / (link_details[particletype] * viz.particleMultiplier));
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







// ##########################################################################################################################################################
//            _____ _              ____      _            
//           |_   _(_)_ __  _   _ / ___|___ | | ___  _ __ 
//             | | | | '_ \| | | | |   / _ \| |/ _ \| '__|
//             | | | | | | | |_| | |__| (_) | | (_) | |   
//             |_| |_|_| |_|\__, |\____\___/|_|\___/|_|   
//                          |___/                         
// ##########################################################################################################################################################
    // TinyColor v1.4.1
    // https://github.com/bgrins/TinyColor
    // Brian Grinstead, MIT License

    var tinycolor = (function(Math) {

    var trimLeft = /^\s+/,
        trimRight = /\s+$/,
        tinyCounter = 0,
        mathRound = Math.round,
        mathMin = Math.min,
        mathMax = Math.max,
        mathRandom = Math.random;

    function tinycolor (color, opts) {

        color = (color) ? color : '';
        opts = opts || { };

        // If input is already a tinycolor, return itself
        if (color instanceof tinycolor) {
        return color;
        }
        // If we are called as a function, call using new instead
        if (!(this instanceof tinycolor)) {
            return new tinycolor(color, opts);
        }

        var rgb = inputToRGB(color);
        this._originalInput = color,
        this._r = rgb.r,
        this._g = rgb.g,
        this._b = rgb.b,
        this._a = rgb.a,
        this._roundA = mathRound(100*this._a) / 100,
        this._format = opts.format || rgb.format;
        this._gradientType = opts.gradientType;

        // Don't let the range of [0,255] come back in [0,1].
        // Potentially lose a little bit of precision here, but will fix issues where
        // .5 gets interpreted as half of the total, instead of half of 1
        // If it was supposed to be 128, this was already taken care of by `inputToRgb`
        if (this._r < 1) { this._r = mathRound(this._r); }
        if (this._g < 1) { this._g = mathRound(this._g); }
        if (this._b < 1) { this._b = mathRound(this._b); }

        this._ok = rgb.ok;
        this._tc_id = tinyCounter++;
    }

    tinycolor.prototype = {
        isDark: function() {
            return this.getBrightness() < 128;
        },
        isLight: function() {
            return !this.isDark();
        },
        isValid: function() {
            return this._ok;
        },
        getOriginalInput: function() {
        return this._originalInput;
        },
        getFormat: function() {
            return this._format;
        },
        getAlpha: function() {
            return this._a;
        },
        getBrightness: function() {
            //http://www.w3.org/TR/AERT#color-contrast
            var rgb = this.toRgb();
            return (rgb.r * 299 + rgb.g * 587 + rgb.b * 114) / 1000;
        },
        getLuminance: function() {
            //http://www.w3.org/TR/2008/REC-WCAG20-20081211/#relativeluminancedef
            var rgb = this.toRgb();
            var RsRGB, GsRGB, BsRGB, R, G, B;
            RsRGB = rgb.r/255;
            GsRGB = rgb.g/255;
            BsRGB = rgb.b/255;

            if (RsRGB <= 0.03928) {R = RsRGB / 12.92;} else {R = Math.pow(((RsRGB + 0.055) / 1.055), 2.4);}
            if (GsRGB <= 0.03928) {G = GsRGB / 12.92;} else {G = Math.pow(((GsRGB + 0.055) / 1.055), 2.4);}
            if (BsRGB <= 0.03928) {B = BsRGB / 12.92;} else {B = Math.pow(((BsRGB + 0.055) / 1.055), 2.4);}
            return (0.2126 * R) + (0.7152 * G) + (0.0722 * B);
        },
        setAlpha: function(value) {
            this._a = boundAlpha(value);
            this._roundA = mathRound(100*this._a) / 100;
            return this;
        },
        toHsv: function() {
            var hsv = rgbToHsv(this._r, this._g, this._b);
            return { h: hsv.h * 360, s: hsv.s, v: hsv.v, a: this._a };
        },
        toHsvString: function() {
            var hsv = rgbToHsv(this._r, this._g, this._b);
            var h = mathRound(hsv.h * 360), s = mathRound(hsv.s * 100), v = mathRound(hsv.v * 100);
            return (this._a == 1) ?
            "hsv("  + h + ", " + s + "%, " + v + "%)" :
            "hsva(" + h + ", " + s + "%, " + v + "%, "+ this._roundA + ")";
        },
        toHsl: function() {
            var hsl = rgbToHsl(this._r, this._g, this._b);
            return { h: hsl.h * 360, s: hsl.s, l: hsl.l, a: this._a };
        },
        toHslString: function() {
            var hsl = rgbToHsl(this._r, this._g, this._b);
            var h = mathRound(hsl.h * 360), s = mathRound(hsl.s * 100), l = mathRound(hsl.l * 100);
            return (this._a == 1) ?
            "hsl("  + h + ", " + s + "%, " + l + "%)" :
            "hsla(" + h + ", " + s + "%, " + l + "%, "+ this._roundA + ")";
        },
        toHex: function(allow3Char) {
            return rgbToHex(this._r, this._g, this._b, allow3Char);
        },
        toHexString: function(allow3Char) {
            return '#' + this.toHex(allow3Char);
        },
        toHex8: function(allow4Char) {
            return rgbaToHex(this._r, this._g, this._b, this._a, allow4Char);
        },
        toHex8String: function(allow4Char) {
            return '#' + this.toHex8(allow4Char);
        },
        toRgb: function() {
            return { r: mathRound(this._r), g: mathRound(this._g), b: mathRound(this._b), a: this._a };
        },
        toRgbString: function() {
            return (this._a == 1) ?
            "rgb("  + mathRound(this._r) + ", " + mathRound(this._g) + ", " + mathRound(this._b) + ")" :
            "rgba(" + mathRound(this._r) + ", " + mathRound(this._g) + ", " + mathRound(this._b) + ", " + this._roundA + ")";
        },
        toPercentageRgb: function() {
            return { r: mathRound(bound01(this._r, 255) * 100) + "%", g: mathRound(bound01(this._g, 255) * 100) + "%", b: mathRound(bound01(this._b, 255) * 100) + "%", a: this._a };
        },
        toPercentageRgbString: function() {
            return (this._a == 1) ?
            "rgb("  + mathRound(bound01(this._r, 255) * 100) + "%, " + mathRound(bound01(this._g, 255) * 100) + "%, " + mathRound(bound01(this._b, 255) * 100) + "%)" :
            "rgba(" + mathRound(bound01(this._r, 255) * 100) + "%, " + mathRound(bound01(this._g, 255) * 100) + "%, " + mathRound(bound01(this._b, 255) * 100) + "%, " + this._roundA + ")";
        },
        toName: function() {
            if (this._a === 0) {
                return "transparent";
            }

            if (this._a < 1) {
                return false;
            }

            return hexNames[rgbToHex(this._r, this._g, this._b, true)] || false;
        },
        toFilter: function(secondColor) {
            var hex8String = '#' + rgbaToArgbHex(this._r, this._g, this._b, this._a);
            var secondHex8String = hex8String;
            var gradientType = this._gradientType ? "GradientType = 1, " : "";

            if (secondColor) {
                var s = tinycolor(secondColor);
                secondHex8String = '#' + rgbaToArgbHex(s._r, s._g, s._b, s._a);
            }

            return "progid:DXImageTransform.Microsoft.gradient("+gradientType+"startColorstr="+hex8String+",endColorstr="+secondHex8String+")";
        },
        toString: function(format) {
            var formatSet = !!format;
            format = format || this._format;

            var formattedString = false;
            var hasAlpha = this._a < 1 && this._a >= 0;
            var needsAlphaFormat = !formatSet && hasAlpha && (format === "hex" || format === "hex6" || format === "hex3" || format === "hex4" || format === "hex8" || format === "name");

            if (needsAlphaFormat) {
                // Special case for "transparent", all other non-alpha formats
                // will return rgba when there is transparency.
                if (format === "name" && this._a === 0) {
                    return this.toName();
                }
                return this.toRgbString();
            }
            if (format === "rgb") {
                formattedString = this.toRgbString();
            }
            if (format === "prgb") {
                formattedString = this.toPercentageRgbString();
            }
            if (format === "hex" || format === "hex6") {
                formattedString = this.toHexString();
            }
            if (format === "hex3") {
                formattedString = this.toHexString(true);
            }
            if (format === "hex4") {
                formattedString = this.toHex8String(true);
            }
            if (format === "hex8") {
                formattedString = this.toHex8String();
            }
            if (format === "name") {
                formattedString = this.toName();
            }
            if (format === "hsl") {
                formattedString = this.toHslString();
            }
            if (format === "hsv") {
                formattedString = this.toHsvString();
            }

            return formattedString || this.toHexString();
        },
        clone: function() {
            return tinycolor(this.toString());
        },

        _applyModification: function(fn, args) {
            var color = fn.apply(null, [this].concat([].slice.call(args)));
            this._r = color._r;
            this._g = color._g;
            this._b = color._b;
            this.setAlpha(color._a);
            return this;
        },
        lighten: function() {
            return this._applyModification(lighten, arguments);
        },
        brighten: function() {
            return this._applyModification(brighten, arguments);
        },
        darken: function() {
            return this._applyModification(darken, arguments);
        },
        desaturate: function() {
            return this._applyModification(desaturate, arguments);
        },
        saturate: function() {
            return this._applyModification(saturate, arguments);
        },
        greyscale: function() {
            return this._applyModification(greyscale, arguments);
        },
        spin: function() {
            return this._applyModification(spin, arguments);
        },

        _applyCombination: function(fn, args) {
            return fn.apply(null, [this].concat([].slice.call(args)));
        },
        analogous: function() {
            return this._applyCombination(analogous, arguments);
        },
        complement: function() {
            return this._applyCombination(complement, arguments);
        },
        monochromatic: function() {
            return this._applyCombination(monochromatic, arguments);
        },
        splitcomplement: function() {
            return this._applyCombination(splitcomplement, arguments);
        },
        triad: function() {
            return this._applyCombination(triad, arguments);
        },
        tetrad: function() {
            return this._applyCombination(tetrad, arguments);
        }
    };

    // If input is an object, force 1 into "1.0" to handle ratios properly
    // String input requires "1.0" as input, so 1 will be treated as 1
    tinycolor.fromRatio = function(color, opts) {
        if (typeof color == "object") {
            var newColor = {};
            for (var i in color) {
                if (color.hasOwnProperty(i)) {
                    if (i === "a") {
                        newColor[i] = color[i];
                    }
                    else {
                        newColor[i] = convertToPercentage(color[i]);
                    }
                }
            }
            color = newColor;
        }

        return tinycolor(color, opts);
    };

    // Given a string or object, convert that input to RGB
    // Possible string inputs:
    //
    //     "red"
    //     "#f00" or "f00"
    //     "#ff0000" or "ff0000"
    //     "#ff000000" or "ff000000"
    //     "rgb 255 0 0" or "rgb (255, 0, 0)"
    //     "rgb 1.0 0 0" or "rgb (1, 0, 0)"
    //     "rgba (255, 0, 0, 1)" or "rgba 255, 0, 0, 1"
    //     "rgba (1.0, 0, 0, 1)" or "rgba 1.0, 0, 0, 1"
    //     "hsl(0, 100%, 50%)" or "hsl 0 100% 50%"
    //     "hsla(0, 100%, 50%, 1)" or "hsla 0 100% 50%, 1"
    //     "hsv(0, 100%, 100%)" or "hsv 0 100% 100%"
    //
    function inputToRGB(color) {

        var rgb = { r: 0, g: 0, b: 0 };
        var a = 1;
        var s = null;
        var v = null;
        var l = null;
        var ok = false;
        var format = false;

        if (typeof color == "string") {
            color = stringInputToObject(color);
        }

        if (typeof color == "object") {
            if (isValidCSSUnit(color.r) && isValidCSSUnit(color.g) && isValidCSSUnit(color.b)) {
                rgb = rgbToRgb(color.r, color.g, color.b);
                ok = true;
                format = String(color.r).substr(-1) === "%" ? "prgb" : "rgb";
            }
            else if (isValidCSSUnit(color.h) && isValidCSSUnit(color.s) && isValidCSSUnit(color.v)) {
                s = convertToPercentage(color.s);
                v = convertToPercentage(color.v);
                rgb = hsvToRgb(color.h, s, v);
                ok = true;
                format = "hsv";
            }
            else if (isValidCSSUnit(color.h) && isValidCSSUnit(color.s) && isValidCSSUnit(color.l)) {
                s = convertToPercentage(color.s);
                l = convertToPercentage(color.l);
                rgb = hslToRgb(color.h, s, l);
                ok = true;
                format = "hsl";
            }

            if (color.hasOwnProperty("a")) {
                a = color.a;
            }
        }

        a = boundAlpha(a);

        return {
            ok: ok,
            format: color.format || format,
            r: mathMin(255, mathMax(rgb.r, 0)),
            g: mathMin(255, mathMax(rgb.g, 0)),
            b: mathMin(255, mathMax(rgb.b, 0)),
            a: a
        };
    }


    // Conversion Functions
    // --------------------

    // `rgbToHsl`, `rgbToHsv`, `hslToRgb`, `hsvToRgb` modified from:
    // <http://mjijackson.com/2008/02/rgb-to-hsl-and-rgb-to-hsv-color-model-conversion-algorithms-in-javascript>

    // `rgbToRgb`
    // Handle bounds / percentage checking to conform to CSS color spec
    // <http://www.w3.org/TR/css3-color/>
    // *Assumes:* r, g, b in [0, 255] or [0, 1]
    // *Returns:* { r, g, b } in [0, 255]
    function rgbToRgb(r, g, b){
        return {
            r: bound01(r, 255) * 255,
            g: bound01(g, 255) * 255,
            b: bound01(b, 255) * 255
        };
    }

    // `rgbToHsl`
    // Converts an RGB color value to HSL.
    // *Assumes:* r, g, and b are contained in [0, 255] or [0, 1]
    // *Returns:* { h, s, l } in [0,1]
    function rgbToHsl(r, g, b) {

        r = bound01(r, 255);
        g = bound01(g, 255);
        b = bound01(b, 255);

        var max = mathMax(r, g, b), min = mathMin(r, g, b);
        var h, s, l = (max + min) / 2;

        if(max == min) {
            h = s = 0; // achromatic
        }
        else {
            var d = max - min;
            s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
            switch(max) {
                case r: h = (g - b) / d + (g < b ? 6 : 0); break;
                case g: h = (b - r) / d + 2; break;
                case b: h = (r - g) / d + 4; break;
            }

            h /= 6;
        }

        return { h: h, s: s, l: l };
    }

    // `hslToRgb`
    // Converts an HSL color value to RGB.
    // *Assumes:* h is contained in [0, 1] or [0, 360] and s and l are contained [0, 1] or [0, 100]
    // *Returns:* { r, g, b } in the set [0, 255]
    function hslToRgb(h, s, l) {
        var r, g, b;

        h = bound01(h, 360);
        s = bound01(s, 100);
        l = bound01(l, 100);

        function hue2rgb(p, q, t) {
            if(t < 0) t += 1;
            if(t > 1) t -= 1;
            if(t < 1/6) return p + (q - p) * 6 * t;
            if(t < 1/2) return q;
            if(t < 2/3) return p + (q - p) * (2/3 - t) * 6;
            return p;
        }

        if(s === 0) {
            r = g = b = l; // achromatic
        }
        else {
            var q = l < 0.5 ? l * (1 + s) : l + s - l * s;
            var p = 2 * l - q;
            r = hue2rgb(p, q, h + 1/3);
            g = hue2rgb(p, q, h);
            b = hue2rgb(p, q, h - 1/3);
        }

        return { r: r * 255, g: g * 255, b: b * 255 };
    }

    // `rgbToHsv`
    // Converts an RGB color value to HSV
    // *Assumes:* r, g, and b are contained in the set [0, 255] or [0, 1]
    // *Returns:* { h, s, v } in [0,1]
    function rgbToHsv(r, g, b) {

        r = bound01(r, 255);
        g = bound01(g, 255);
        b = bound01(b, 255);

        var max = mathMax(r, g, b), min = mathMin(r, g, b);
        var h, s, v = max;

        var d = max - min;
        s = max === 0 ? 0 : d / max;

        if(max == min) {
            h = 0; // achromatic
        }
        else {
            switch(max) {
                case r: h = (g - b) / d + (g < b ? 6 : 0); break;
                case g: h = (b - r) / d + 2; break;
                case b: h = (r - g) / d + 4; break;
            }
            h /= 6;
        }
        return { h: h, s: s, v: v };
    }

    // `hsvToRgb`
    // Converts an HSV color value to RGB.
    // *Assumes:* h is contained in [0, 1] or [0, 360] and s and v are contained in [0, 1] or [0, 100]
    // *Returns:* { r, g, b } in the set [0, 255]
    function hsvToRgb(h, s, v) {

        h = bound01(h, 360) * 6;
        s = bound01(s, 100);
        v = bound01(v, 100);

        var i = Math.floor(h),
            f = h - i,
            p = v * (1 - s),
            q = v * (1 - f * s),
            t = v * (1 - (1 - f) * s),
            mod = i % 6,
            r = [v, q, p, p, t, v][mod],
            g = [t, v, v, q, p, p][mod],
            b = [p, p, t, v, v, q][mod];

        return { r: r * 255, g: g * 255, b: b * 255 };
    }

    // `rgbToHex`
    // Converts an RGB color to hex
    // Assumes r, g, and b are contained in the set [0, 255]
    // Returns a 3 or 6 character hex
    function rgbToHex(r, g, b, allow3Char) {

        var hex = [
            pad2(mathRound(r).toString(16)),
            pad2(mathRound(g).toString(16)),
            pad2(mathRound(b).toString(16))
        ];

        // Return a 3 character hex if possible
        if (allow3Char && hex[0].charAt(0) == hex[0].charAt(1) && hex[1].charAt(0) == hex[1].charAt(1) && hex[2].charAt(0) == hex[2].charAt(1)) {
            return hex[0].charAt(0) + hex[1].charAt(0) + hex[2].charAt(0);
        }

        return hex.join("");
    }

    // `rgbaToHex`
    // Converts an RGBA color plus alpha transparency to hex
    // Assumes r, g, b are contained in the set [0, 255] and
    // a in [0, 1]. Returns a 4 or 8 character rgba hex
    function rgbaToHex(r, g, b, a, allow4Char) {

        var hex = [
            pad2(mathRound(r).toString(16)),
            pad2(mathRound(g).toString(16)),
            pad2(mathRound(b).toString(16)),
            pad2(convertDecimalToHex(a))
        ];

        // Return a 4 character hex if possible
        if (allow4Char && hex[0].charAt(0) == hex[0].charAt(1) && hex[1].charAt(0) == hex[1].charAt(1) && hex[2].charAt(0) == hex[2].charAt(1) && hex[3].charAt(0) == hex[3].charAt(1)) {
            return hex[0].charAt(0) + hex[1].charAt(0) + hex[2].charAt(0) + hex[3].charAt(0);
        }

        return hex.join("");
    }

    // `rgbaToArgbHex`
    // Converts an RGBA color to an ARGB Hex8 string
    // Rarely used, but required for "toFilter()"
    function rgbaToArgbHex(r, g, b, a) {

        var hex = [
            pad2(convertDecimalToHex(a)),
            pad2(mathRound(r).toString(16)),
            pad2(mathRound(g).toString(16)),
            pad2(mathRound(b).toString(16))
        ];

        return hex.join("");
    }

    // `equals`
    // Can be called with any tinycolor input
    tinycolor.equals = function (color1, color2) {
        if (!color1 || !color2) { return false; }
        return tinycolor(color1).toRgbString() == tinycolor(color2).toRgbString();
    };

    tinycolor.random = function() {
        return tinycolor.fromRatio({
            r: mathRandom(),
            g: mathRandom(),
            b: mathRandom()
        });
    };


    // Modification Functions
    // ----------------------
    // Thanks to less.js for some of the basics here
    // <https://github.com/cloudhead/less.js/blob/master/lib/less/functions.js>

    function desaturate(color, amount) {
        amount = (amount === 0) ? 0 : (amount || 10);
        var hsl = tinycolor(color).toHsl();
        hsl.s -= amount / 100;
        hsl.s = clamp01(hsl.s);
        return tinycolor(hsl);
    }

    function saturate(color, amount) {
        amount = (amount === 0) ? 0 : (amount || 10);
        var hsl = tinycolor(color).toHsl();
        hsl.s += amount / 100;
        hsl.s = clamp01(hsl.s);
        return tinycolor(hsl);
    }

    function greyscale(color) {
        return tinycolor(color).desaturate(100);
    }

    function lighten (color, amount) {
        amount = (amount === 0) ? 0 : (amount || 10);
        var hsl = tinycolor(color).toHsl();
        hsl.l += amount / 100;
        hsl.l = clamp01(hsl.l);
        return tinycolor(hsl);
    }

    function brighten(color, amount) {
        amount = (amount === 0) ? 0 : (amount || 10);
        var rgb = tinycolor(color).toRgb();
        rgb.r = mathMax(0, mathMin(255, rgb.r - mathRound(255 * - (amount / 100))));
        rgb.g = mathMax(0, mathMin(255, rgb.g - mathRound(255 * - (amount / 100))));
        rgb.b = mathMax(0, mathMin(255, rgb.b - mathRound(255 * - (amount / 100))));
        return tinycolor(rgb);
    }

    function darken (color, amount) {
        amount = (amount === 0) ? 0 : (amount || 10);
        var hsl = tinycolor(color).toHsl();
        hsl.l -= amount / 100;
        hsl.l = clamp01(hsl.l);
        return tinycolor(hsl);
    }

    // Spin takes a positive or negative amount within [-360, 360] indicating the change of hue.
    // Values outside of this range will be wrapped into this range.
    function spin(color, amount) {
        var hsl = tinycolor(color).toHsl();
        var hue = (hsl.h + amount) % 360;
        hsl.h = hue < 0 ? 360 + hue : hue;
        return tinycolor(hsl);
    }

    // Combination Functions
    // ---------------------
    // Thanks to jQuery xColor for some of the ideas behind these
    // <https://github.com/infusion/jQuery-xcolor/blob/master/jquery.xcolor.js>

    function complement(color) {
        var hsl = tinycolor(color).toHsl();
        hsl.h = (hsl.h + 180) % 360;
        return tinycolor(hsl);
    }

    function triad(color) {
        var hsl = tinycolor(color).toHsl();
        var h = hsl.h;
        return [
            tinycolor(color),
            tinycolor({ h: (h + 120) % 360, s: hsl.s, l: hsl.l }),
            tinycolor({ h: (h + 240) % 360, s: hsl.s, l: hsl.l })
        ];
    }

    function tetrad(color) {
        var hsl = tinycolor(color).toHsl();
        var h = hsl.h;
        return [
            tinycolor(color),
            tinycolor({ h: (h + 90) % 360, s: hsl.s, l: hsl.l }),
            tinycolor({ h: (h + 180) % 360, s: hsl.s, l: hsl.l }),
            tinycolor({ h: (h + 270) % 360, s: hsl.s, l: hsl.l })
        ];
    }

    function splitcomplement(color) {
        var hsl = tinycolor(color).toHsl();
        var h = hsl.h;
        return [
            tinycolor(color),
            tinycolor({ h: (h + 72) % 360, s: hsl.s, l: hsl.l}),
            tinycolor({ h: (h + 216) % 360, s: hsl.s, l: hsl.l})
        ];
    }

    function analogous(color, results, slices) {
        results = results || 6;
        slices = slices || 30;

        var hsl = tinycolor(color).toHsl();
        var part = 360 / slices;
        var ret = [tinycolor(color)];

        for (hsl.h = ((hsl.h - (part * results >> 1)) + 720) % 360; --results; ) {
            hsl.h = (hsl.h + part) % 360;
            ret.push(tinycolor(hsl));
        }
        return ret;
    }

    function monochromatic(color, results) {
        results = results || 6;
        var hsv = tinycolor(color).toHsv();
        var h = hsv.h, s = hsv.s, v = hsv.v;
        var ret = [];
        var modification = 1 / results;

        while (results--) {
            ret.push(tinycolor({ h: h, s: s, v: v}));
            v = (v + modification) % 1;
        }

        return ret;
    }

    // Utility Functions
    // ---------------------

    tinycolor.mix = function(color1, color2, amount) {
        amount = (amount === 0) ? 0 : (amount || 50);

        var rgb1 = tinycolor(color1).toRgb();
        var rgb2 = tinycolor(color2).toRgb();

        var p = amount / 100;

        var rgba = {
            r: ((rgb2.r - rgb1.r) * p) + rgb1.r,
            g: ((rgb2.g - rgb1.g) * p) + rgb1.g,
            b: ((rgb2.b - rgb1.b) * p) + rgb1.b,
            a: ((rgb2.a - rgb1.a) * p) + rgb1.a
        };

        return tinycolor(rgba);
    };


    // Readability Functions
    // ---------------------
    // <http://www.w3.org/TR/2008/REC-WCAG20-20081211/#contrast-ratiodef (WCAG Version 2)

    // `contrast`
    // Analyze the 2 colors and returns the color contrast defined by (WCAG Version 2)
    tinycolor.readability = function(color1, color2) {
        var c1 = tinycolor(color1);
        var c2 = tinycolor(color2);
        return (Math.max(c1.getLuminance(),c2.getLuminance())+0.05) / (Math.min(c1.getLuminance(),c2.getLuminance())+0.05);
    };

    // `isReadable`
    // Ensure that foreground and background color combinations meet WCAG2 guidelines.
    // The third argument is an optional Object.
    //      the 'level' property states 'AA' or 'AAA' - if missing or invalid, it defaults to 'AA';
    //      the 'size' property states 'large' or 'small' - if missing or invalid, it defaults to 'small'.
    // If the entire object is absent, isReadable defaults to {level:"AA",size:"small"}.

    // *Example*
    //    tinycolor.isReadable("#000", "#111") => false
    //    tinycolor.isReadable("#000", "#111",{level:"AA",size:"large"}) => false
    tinycolor.isReadable = function(color1, color2, wcag2) {
        var readability = tinycolor.readability(color1, color2);
        var wcag2Parms, out;

        out = false;

        wcag2Parms = validateWCAG2Parms(wcag2);
        switch (wcag2Parms.level + wcag2Parms.size) {
            case "AAsmall":
            case "AAAlarge":
                out = readability >= 4.5;
                break;
            case "AAlarge":
                out = readability >= 3;
                break;
            case "AAAsmall":
                out = readability >= 7;
                break;
        }
        return out;

    };

    // `mostReadable`
    // Given a base color and a list of possible foreground or background
    // colors for that base, returns the most readable color.
    // Optionally returns Black or White if the most readable color is unreadable.
    // *Example*
    //    tinycolor.mostReadable(tinycolor.mostReadable("#123", ["#124", "#125"],{includeFallbackColors:false}).toHexString(); // "#112255"
    //    tinycolor.mostReadable(tinycolor.mostReadable("#123", ["#124", "#125"],{includeFallbackColors:true}).toHexString();  // "#ffffff"
    //    tinycolor.mostReadable("#a8015a", ["#faf3f3"],{includeFallbackColors:true,level:"AAA",size:"large"}).toHexString(); // "#faf3f3"
    //    tinycolor.mostReadable("#a8015a", ["#faf3f3"],{includeFallbackColors:true,level:"AAA",size:"small"}).toHexString(); // "#ffffff"
    tinycolor.mostReadable = function(baseColor, colorList, args) {
        var bestColor = null;
        var bestScore = 0;
        var readability;
        var includeFallbackColors, level, size ;
        args = args || {};
        includeFallbackColors = args.includeFallbackColors ;
        level = args.level;
        size = args.size;

        for (var i= 0; i < colorList.length ; i++) {
            readability = tinycolor.readability(baseColor, colorList[i]);
            if (readability > bestScore) {
                bestScore = readability;
                bestColor = tinycolor(colorList[i]);
            }
        }

        if (tinycolor.isReadable(baseColor, bestColor, {"level":level,"size":size}) || !includeFallbackColors) {
            return bestColor;
        }
        else {
            args.includeFallbackColors=false;
            return tinycolor.mostReadable(baseColor,["#fff", "#000"],args);
        }
    };


    // Big List of Colors
    // ------------------
    // <http://www.w3.org/TR/css3-color/#svg-color>
    var names = tinycolor.names = {
        aliceblue: "f0f8ff",
        antiquewhite: "faebd7",
        aqua: "0ff",
        aquamarine: "7fffd4",
        azure: "f0ffff",
        beige: "f5f5dc",
        bisque: "ffe4c4",
        black: "000",
        blanchedalmond: "ffebcd",
        blue: "00f",
        blueviolet: "8a2be2",
        brown: "a52a2a",
        burlywood: "deb887",
        burntsienna: "ea7e5d",
        cadetblue: "5f9ea0",
        chartreuse: "7fff00",
        chocolate: "d2691e",
        coral: "ff7f50",
        cornflowerblue: "6495ed",
        cornsilk: "fff8dc",
        crimson: "dc143c",
        cyan: "0ff",
        darkblue: "00008b",
        darkcyan: "008b8b",
        darkgoldenrod: "b8860b",
        darkgray: "a9a9a9",
        darkgreen: "006400",
        darkgrey: "a9a9a9",
        darkkhaki: "bdb76b",
        darkmagenta: "8b008b",
        darkolivegreen: "556b2f",
        darkorange: "ff8c00",
        darkorchid: "9932cc",
        darkred: "8b0000",
        darksalmon: "e9967a",
        darkseagreen: "8fbc8f",
        darkslateblue: "483d8b",
        darkslategray: "2f4f4f",
        darkslategrey: "2f4f4f",
        darkturquoise: "00ced1",
        darkviolet: "9400d3",
        deeppink: "ff1493",
        deepskyblue: "00bfff",
        dimgray: "696969",
        dimgrey: "696969",
        dodgerblue: "1e90ff",
        firebrick: "b22222",
        floralwhite: "fffaf0",
        forestgreen: "228b22",
        fuchsia: "f0f",
        gainsboro: "dcdcdc",
        ghostwhite: "f8f8ff",
        gold: "ffd700",
        goldenrod: "daa520",
        gray: "808080",
        green: "008000",
        greenyellow: "adff2f",
        grey: "808080",
        honeydew: "f0fff0",
        hotpink: "ff69b4",
        indianred: "cd5c5c",
        indigo: "4b0082",
        ivory: "fffff0",
        khaki: "f0e68c",
        lavender: "e6e6fa",
        lavenderblush: "fff0f5",
        lawngreen: "7cfc00",
        lemonchiffon: "fffacd",
        lightblue: "add8e6",
        lightcoral: "f08080",
        lightcyan: "e0ffff",
        lightgoldenrodyellow: "fafad2",
        lightgray: "d3d3d3",
        lightgreen: "90ee90",
        lightgrey: "d3d3d3",
        lightpink: "ffb6c1",
        lightsalmon: "ffa07a",
        lightseagreen: "20b2aa",
        lightskyblue: "87cefa",
        lightslategray: "789",
        lightslategrey: "789",
        lightsteelblue: "b0c4de",
        lightyellow: "ffffe0",
        lime: "0f0",
        limegreen: "32cd32",
        linen: "faf0e6",
        magenta: "f0f",
        maroon: "800000",
        mediumaquamarine: "66cdaa",
        mediumblue: "0000cd",
        mediumorchid: "ba55d3",
        mediumpurple: "9370db",
        mediumseagreen: "3cb371",
        mediumslateblue: "7b68ee",
        mediumspringgreen: "00fa9a",
        mediumturquoise: "48d1cc",
        mediumvioletred: "c71585",
        midnightblue: "191970",
        mintcream: "f5fffa",
        mistyrose: "ffe4e1",
        moccasin: "ffe4b5",
        navajowhite: "ffdead",
        navy: "000080",
        oldlace: "fdf5e6",
        olive: "808000",
        olivedrab: "6b8e23",
        orange: "ffa500",
        orangered: "ff4500",
        orchid: "da70d6",
        palegoldenrod: "eee8aa",
        palegreen: "98fb98",
        paleturquoise: "afeeee",
        palevioletred: "db7093",
        papayawhip: "ffefd5",
        peachpuff: "ffdab9",
        peru: "cd853f",
        pink: "ffc0cb",
        plum: "dda0dd",
        powderblue: "b0e0e6",
        purple: "800080",
        rebeccapurple: "663399",
        red: "f00",
        rosybrown: "bc8f8f",
        royalblue: "4169e1",
        saddlebrown: "8b4513",
        salmon: "fa8072",
        sandybrown: "f4a460",
        seagreen: "2e8b57",
        seashell: "fff5ee",
        sienna: "a0522d",
        silver: "c0c0c0",
        skyblue: "87ceeb",
        slateblue: "6a5acd",
        slategray: "708090",
        slategrey: "708090",
        snow: "fffafa",
        springgreen: "00ff7f",
        steelblue: "4682b4",
        tan: "d2b48c",
        teal: "008080",
        thistle: "d8bfd8",
        tomato: "ff6347",
        turquoise: "40e0d0",
        violet: "ee82ee",
        wheat: "f5deb3",
        white: "fff",
        whitesmoke: "f5f5f5",
        yellow: "ff0",
        yellowgreen: "9acd32"
    };

    // Make it easy to access colors via `hexNames[hex]`
    var hexNames = tinycolor.hexNames = flip(names);


    // Utilities
    // ---------

    // `{ 'name1': 'val1' }` becomes `{ 'val1': 'name1' }`
    function flip(o) {
        var flipped = { };
        for (var i in o) {
            if (o.hasOwnProperty(i)) {
                flipped[o[i]] = i;
            }
        }
        return flipped;
    }

    // Return a valid alpha value [0,1] with all invalid values being set to 1
    function boundAlpha(a) {
        a = parseFloat(a);

        if (isNaN(a) || a < 0 || a > 1) {
            a = 1;
        }

        return a;
    }

    // Take input from [0, n] and return it as [0, 1]
    function bound01(n, max) {
        if (isOnePointZero(n)) { n = "100%"; }

        var processPercent = isPercentage(n);
        n = mathMin(max, mathMax(0, parseFloat(n)));

        // Automatically convert percentage into number
        if (processPercent) {
            n = parseInt(n * max, 10) / 100;
        }

        // Handle floating point rounding errors
        if ((Math.abs(n - max) < 0.000001)) {
            return 1;
        }

        // Convert into [0, 1] range if it isn't already
        return (n % max) / parseFloat(max);
    }

    // Force a number between 0 and 1
    function clamp01(val) {
        return mathMin(1, mathMax(0, val));
    }

    // Parse a base-16 hex value into a base-10 integer
    function parseIntFromHex(val) {
        return parseInt(val, 16);
    }

    // Need to handle 1.0 as 100%, since once it is a number, there is no difference between it and 1
    // <http://stackoverflow.com/questions/7422072/javascript-how-to-detect-number-as-a-decimal-including-1-0>
    function isOnePointZero(n) {
        return typeof n == "string" && n.indexOf('.') != -1 && parseFloat(n) === 1;
    }

    // Check to see if string passed in is a percentage
    function isPercentage(n) {
        return typeof n === "string" && n.indexOf('%') != -1;
    }

    // Force a hex value to have 2 characters
    function pad2(c) {
        return c.length == 1 ? '0' + c : '' + c;
    }

    // Replace a decimal with it's percentage value
    function convertToPercentage(n) {
        if (n <= 1) {
            n = (n * 100) + "%";
        }

        return n;
    }

    // Converts a decimal to a hex value
    function convertDecimalToHex(d) {
        return Math.round(parseFloat(d) * 255).toString(16);
    }
    // Converts a hex value to a decimal
    function convertHexToDecimal(h) {
        return (parseIntFromHex(h) / 255);
    }

    var matchers = (function() {

        // <http://www.w3.org/TR/css3-values/#integers>
        var CSS_INTEGER = "[-\\+]?\\d+%?";

        // <http://www.w3.org/TR/css3-values/#number-value>
        var CSS_NUMBER = "[-\\+]?\\d*\\.\\d+%?";

        // Allow positive/negative integer/number.  Don't capture the either/or, just the entire outcome.
        var CSS_UNIT = "(?:" + CSS_NUMBER + ")|(?:" + CSS_INTEGER + ")";

        // Actual matching.
        // Parentheses and commas are optional, but not required.
        // Whitespace can take the place of commas or opening paren
        var PERMISSIVE_MATCH3 = "[\\s|\\(]+(" + CSS_UNIT + ")[,|\\s]+(" + CSS_UNIT + ")[,|\\s]+(" + CSS_UNIT + ")\\s*\\)?";
        var PERMISSIVE_MATCH4 = "[\\s|\\(]+(" + CSS_UNIT + ")[,|\\s]+(" + CSS_UNIT + ")[,|\\s]+(" + CSS_UNIT + ")[,|\\s]+(" + CSS_UNIT + ")\\s*\\)?";

        return {
            CSS_UNIT: new RegExp(CSS_UNIT),
            rgb: new RegExp("rgb" + PERMISSIVE_MATCH3),
            rgba: new RegExp("rgba" + PERMISSIVE_MATCH4),
            hsl: new RegExp("hsl" + PERMISSIVE_MATCH3),
            hsla: new RegExp("hsla" + PERMISSIVE_MATCH4),
            hsv: new RegExp("hsv" + PERMISSIVE_MATCH3),
            hsva: new RegExp("hsva" + PERMISSIVE_MATCH4),
            hex3: /^#?([0-9a-fA-F]{1})([0-9a-fA-F]{1})([0-9a-fA-F]{1})$/,
            hex6: /^#?([0-9a-fA-F]{2})([0-9a-fA-F]{2})([0-9a-fA-F]{2})$/,
            hex4: /^#?([0-9a-fA-F]{1})([0-9a-fA-F]{1})([0-9a-fA-F]{1})([0-9a-fA-F]{1})$/,
            hex8: /^#?([0-9a-fA-F]{2})([0-9a-fA-F]{2})([0-9a-fA-F]{2})([0-9a-fA-F]{2})$/
        };
    })();

    // `isValidCSSUnit`
    // Take in a single string / number and check to see if it looks like a CSS unit
    // (see `matchers` above for definition).
    function isValidCSSUnit(color) {
        return !!matchers.CSS_UNIT.exec(color);
    }

    // `stringInputToObject`
    // Permissive string parsing.  Take in a number of formats, and output an object
    // based on detected format.  Returns `{ r, g, b }` or `{ h, s, l }` or `{ h, s, v}`
    function stringInputToObject(color) {

        color = color.replace(trimLeft,'').replace(trimRight, '').toLowerCase();
        var named = false;
        if (names[color]) {
            color = names[color];
            named = true;
        }
        else if (color == 'transparent') {
            return { r: 0, g: 0, b: 0, a: 0, format: "name" };
        }

        // Try to match string input using regular expressions.
        // Keep most of the number bounding out of this function - don't worry about [0,1] or [0,100] or [0,360]
        // Just return an object and let the conversion functions handle that.
        // This way the result will be the same whether the tinycolor is initialized with string or object.
        var match;
        if ((match = matchers.rgb.exec(color))) {
            return { r: match[1], g: match[2], b: match[3] };
        }
        if ((match = matchers.rgba.exec(color))) {
            return { r: match[1], g: match[2], b: match[3], a: match[4] };
        }
        if ((match = matchers.hsl.exec(color))) {
            return { h: match[1], s: match[2], l: match[3] };
        }
        if ((match = matchers.hsla.exec(color))) {
            return { h: match[1], s: match[2], l: match[3], a: match[4] };
        }
        if ((match = matchers.hsv.exec(color))) {
            return { h: match[1], s: match[2], v: match[3] };
        }
        if ((match = matchers.hsva.exec(color))) {
            return { h: match[1], s: match[2], v: match[3], a: match[4] };
        }
        if ((match = matchers.hex8.exec(color))) {
            return {
                r: parseIntFromHex(match[1]),
                g: parseIntFromHex(match[2]),
                b: parseIntFromHex(match[3]),
                a: convertHexToDecimal(match[4]),
                format: named ? "name" : "hex8"
            };
        }
        if ((match = matchers.hex6.exec(color))) {
            return {
                r: parseIntFromHex(match[1]),
                g: parseIntFromHex(match[2]),
                b: parseIntFromHex(match[3]),
                format: named ? "name" : "hex"
            };
        }
        if ((match = matchers.hex4.exec(color))) {
            return {
                r: parseIntFromHex(match[1] + '' + match[1]),
                g: parseIntFromHex(match[2] + '' + match[2]),
                b: parseIntFromHex(match[3] + '' + match[3]),
                a: convertHexToDecimal(match[4] + '' + match[4]),
                format: named ? "name" : "hex8"
            };
        }
        if ((match = matchers.hex3.exec(color))) {
            return {
                r: parseIntFromHex(match[1] + '' + match[1]),
                g: parseIntFromHex(match[2] + '' + match[2]),
                b: parseIntFromHex(match[3] + '' + match[3]),
                format: named ? "name" : "hex"
            };
        }

        return false;
    }

    function validateWCAG2Parms(parms) {
        // return valid WCAG2 parms for isReadable.
        // If input parms are invalid, return {"level":"AA", "size":"small"}
        var level, size;
        parms = parms || {"level":"AA", "size":"small"};
        level = (parms.level || "AA").toUpperCase();
        size = (parms.size || "small").toLowerCase();
        if (level !== "AA" && level !== "AAA") {
            level = "AA";
        }
        if (size !== "small" && size !== "large") {
            size = "small";
        }
        return {"level":level, "size":size};
    }

    return tinycolor;

    })(Math);

    return SplunkVisualizationBase.extend(vizObj);
});