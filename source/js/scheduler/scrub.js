/**
 * Created by Jonathan on 1/25/2015.
 */

'use strict';

module.exports = function (helpers, d3Provider, $q, $compile) {
    return {
        restrict: 'A',
        scope: {
            height: '=',
            width: '=',
            granularity: '=',
            scrub: '=',
            onEnd: '=',
            layers: '=',
            activeLayerId: '=',
            preferred: '=',
            importedLayer: '='
        },
        link: function (scope, element, attrs) {
            var radius = 5;
			var heightFactor = 0.65; //height of available event block vs preferred
			var layer;

            d3Provider.d3().then(function (d3) {
                scope.el = d3.select(element[0]);

                var changeLastPreference = function () {
                    if (scope.activeLayerId !== undefined && scope.layers.length > scope.activeLayerId) {
                        var active_brushWrappers = scope.layers[scope.activeLayerId].data;
                        var lastBrushWrappers = active_brushWrappers[0];
                        lastBrushWrappers.preferred = scope.preferred;

                        update();
                    }
                };

                //newBrush is a wrapper around d3Brush that deals with Schedulenaut specific function:
                //    popover, delete, preference type, etc.
                var newBrush = function (previousBrushWrapper) {
                    var brushstart = function () {
                        if (d3.event.sourceEvent)
                            brush.mouseStart = d3.event.sourceEvent.x;
                    };

                    var brushed = function () {
                        var extent0 = brush.extent(),
                            extent1;

                        // if dragging, preserve the width of the extent
                        if (d3.event.mode === "move") {
                            var d0, d1;

                            if (scope.granularity === 60) {
                                d0 = d3.time.hour.round(extent0[0]);
                                d1 = d3.time.hour.offset(d0, Math.round((extent0[1] - extent0[0]) / 3600000));
                            }
                            else {
                                d0 = helpers.round(extent0[0], scope.granularity);
                                d1 = d3.time.minute.offset(d0, Math.round((extent0[1] - extent0[0]) / 60000));
                            }

                            extent1 = [d0, d1];

                        }

                        // otherwise, if resizing, round both dates
                        else {

                            // if hour we can use built in d3 function to round use floor & ceil instead
                            if (scope.granularity === 60) {
                                extent1 = extent0.map(d3.time.hour.round);
                                if (extent1[0] >= extent1[1]) {
                                    extent1[0] = d3.time.hour.floor(extent0[0]);
                                    extent1[1] = d3.time.hour.ceil(extent0[1]);
                                }
                            }

                            // else we just add minutes manually
                            else {
                                extent1 = extent0.slice(0);
                                extent1[1].setMinutes(extent1[1].getMinutes() + scope.granularity);

                                extent1[0] = helpers.round(extent0[0], scope.granularity);
                                extent1[1] = helpers.round(extent0[1], scope.granularity);
                            }

                        }

                        //make sure that event blocks (brush) do not overlap

                        //find out what surrounds this brush
                        var edge = helpers.getEdge(brush, scope.layers[scope.activeLayerId].data);

                        //if the current block gets brushed beyond the surrounding block, limit it so it does not go past
                        if (edge[1] !== undefined && extent1[1].getTime() > edge[1].getTime()) {
                            extent1[1] = edge[1];
                            //if we are moving, not only do we stop it from going past, but also keep the brush the same size
                            if (d3.event.mode === "move")
                                extent1[0] = d3.time.hour.offset(extent1[1], -Math.round((brush.extent.start[1] - brush.extent.start[0]) / 3600000));
                        } else if (edge[0] !== undefined && extent1[0].getTime() < edge[0].getTime()) {
                            extent1[0] = edge[0];
                            if (d3.event.mode === "move")
                                extent1[1] = d3.time.hour.offset(extent1[0], Math.round((brush.extent.start[1] - brush.extent.start[0]) / 3600000));
                        }

                        d3.select(this).call(brush.extent(extent1));
                    };

                    var brushend = function () {

                        //Callback function
                        scope.onEnd();

                        //if mouse hasn't moved since mouse down, it is a click (brush doesn't have a click event, so we fake one)
                        if (d3.event.sourceEvent && brush.mouseStart == d3.event.sourceEvent.x)
                            popoverHandler(d3.select(this));

                        //When we finish brushing, the extent will be the starting extent for next time
                        //This is useful for determining what is surrounding the current block later (i.e. to know which blocks bound the brush)
                        storeStartingPosition();

                        //Figure out whether we need to add a new brush or not.
                        //If last brush has been modified, then it's been used and we need to add a new brush.
                        //Else it's still empty, and we don't need to do anything.
                        //Requires mouseStart to exist, otherwise is based on previous
                        var active_brushWrappers = scope.layers[scope.activeLayerId].data;
                        var lastBrush = active_brushWrappers[0];
                        var lastBrushExtent = helpers.getExtent(lastBrush.brush);
                        if (brush.mouseStart && lastBrushExtent[0].getTime() !== lastBrushExtent[1].getTime()) {
                            newBrush();
                            update();
                        }

                    };

                    var storeStartingPosition = function () {
                        brush.extent.start = brush.extent();
                    };

                    var popoverHandler = function (gBrush) {
                        var calculateMidpoint = function () {
                            var brushOffsetX = parseInt(gBrush.select('.extent').attr('x'));
                            var brushWidth = parseInt(gBrush.select('.extent').attr('width'));
                            return parseInt(margin.left + brushOffsetX + (brushWidth / 2));
                        };

                        var getOtherBrushesExtent = function () {
                            var otherExistingBrush = [];

                            for (var i = 0; i < scope.layers[scope.activeLayerId].data.length - 1; i++) {
                                var otherBrush = scope.layers[scope.activeLayerId].data[i];
                                if (otherBrush !== brush)
                                    otherExistingBrush.push(helpers.getExtent(otherBrush));
                            }

                            return otherExistingBrush;
                        };

                        var newScope = scope.$new(true);
                        newScope.x = calculateMidpoint();
                        newScope.start = brush.extent()[0];
                        newScope.end = brush.extent()[1];
                        newScope.preferred = brushWrapper.preferred;
                        newScope.step = scope.granularity;
                        newScope.disabled = getOtherBrushesExtent();
                        newScope.edge = helpers.getEdge(brush, scope.layers[scope.activeLayerId].data);
                        newScope.link = true;

                        var $el = $compile('<div class="scheduler-popover-wrapper"></div>')(newScope);

                        newScope.$watch("preferred", function () {
                            brushWrapper.preferred = newScope.preferred;
                            updatePreferred(gBrush);
                        });
                        newScope.$watchGroup(['start', 'end'], function () {
                            updateExtent(gBrush, [newScope.start, newScope.end]);
                        });
                        newScope.$on('deleteBrush', function () {
                            deleteBrush(gBrush);
                        });

                        angular.element(scope.el.node()).append($el);
                    };

                    var deleteBrush = function (gBrush) {
                        for (var i = 0; i < scope.layers[scope.activeLayerId].data.length; i++) {
                            if (scope.layers[scope.activeLayerId].data[i].brush == brush)
                                scope.layers[scope.activeLayerId].data.splice(i, 1);
                        }
                        gBrush.remove();
                        scope.onEnd();
                    };

                    var updatePreferred = function (gBrush) {
                        gBrush
                            .attr("class", function () {
                                return brushWrapper.preferred ? 'brush preferred' : 'brush';
                            });
                        scope.onEnd();
                    };

                    var updateExtent = function (gBrush, extent) {
                        gBrush.call(brush.extent(extent));
                        brush.extent.start = brush.extent();
                    };

                    var brush = d3.svg.brush()
                        .x(x)
                        .on("brushstart", brushstart)
                        .on("brush", brushed)
                        .on("brushend", brushend);

                    var brushWrapper = previousBrushWrapper || {preferred: scope.preferred, brush: brush};

                    if (previousBrushWrapper)
                        brush.extent(helpers.getExtent(previousBrushWrapper.brush));

                    var currentLayer = scope.layers[scope.activeLayerId];
                    if (previousBrushWrapper !== undefined && !isNaN(previousBrushWrapper.id)) {
                        //If we have our previous brush information, we just need to convert the brush extent
                        //we just need to reconvert it to a d3Brush

                        //Replace the extent with an actual d3 brush
                        previousBrushWrapper.brush = brush;

                        //So later we can know which block surround this block at the start
                        var extent = helpers.getExtent(brush);
                        if (extent[0].getTime() !== extent[1].getTime())
                            storeStartingPosition();
                    }
                    else {
                        var id = currentLayer.data.length;
                        if (currentLayer.data.length > 0)
                            id = currentLayer.data[0].id + 1;

                        brushWrapper.id = id;

                        currentLayer.data.unshift(brushWrapper);
                    }

                    return brush;

                };

                //Set up
                var margin = {top: 5, right: 0, bottom: 5, left: 0};
                var width;
                var height = parseInt(scope.height) - margin.top - margin.bottom;

                var endDate = new Date(scope.scrub.getTime());
                endDate.setDate(endDate.getDate() + 1);
                endDate.setHours(endDate.getHours() - 1);
                endDate.setMinutes(59);

                var x = d3.time.scale.utc()
                    .domain([scope.scrub, endDate]);

                var svg = scope.el.append("svg");

                var g = svg
                    .append("g")
                    .attr("transform", "translate(" + margin.left + ",0)")
					.on('mousemove', function() {
						//see which users have blocks under current mouse
						var userHoveredOver = [];
						var timeUnderMouse = x.invert(d3.event.offsetX);
                        if(scope.layers){
                            scope.layers.forEach(function(d) {
                                d.data.forEach(function(layer) {
                                    var extent = helpers.getExtent(layer.brush);
                                    var inBetween = helpers.inBetween(timeUnderMouse, extent);

                                    if (inBetween) {
                                        if (userHoveredOver.indexOf(d.id) < 0)
                                            userHoveredOver.push(d.id);
                                    }
                                });
                            });
                        }
						scope.$emit('highlightUser', userHoveredOver);
					})
					.on('mouseleave', function() {
						scope.$emit('highlightUser', []);
					});

                var gridBackground = g.append("rect")
                    .attr("class", "grid-background");

                var xgrid = g.append("g")
                    .attr("class", "x grid")
                    .attr("transform", "translate(0,0)");

                var layers = g.append('g')
                    .attr('class', 'layers')
                    .attr("transform", "translate(0," + margin.top + ")");

                var layersImported = g.append('g')
                    .attr('class', 'layers-imported')
                    .attr("transform", "translate(0," + margin.top + ")");

                var brushContainer = g.append('g')
                    .attr('class', 'brushes')
                    .attr("transform", "translate(0," + margin.top + ")");

                var axisGen = d3.svg.axis()
                    .scale(x)
                    .orient("bottom")
                    .ticks(d3.time.hour)
                    .tickSize(height + margin.top + margin.bottom)
                    .tickFormat("");

                //Update the view
                var update = function () {
                    if (scope.width > 0) {
                        width = parseInt(scope.width) - margin.left - margin.right;
                        height = parseInt(scope.height) - margin.top - margin.bottom;

                        x.range([0, width]);

                        xgrid
                            .transition()
                            .call(axisGen);

                        xgrid.selectAll('.tick')
                            .classed('major', function (d) {
                                return d.getHours() % 6 === 0;
                            });

                        svg
                            .attr("width", width + margin.left + margin.right)
                            .attr("height", height + margin.top + margin.bottom);

                        gridBackground
                            .transition()
                            .attr("width", width)
                            .attr("height", height + margin.top + margin.bottom);

                        //render passive brushes
                        layer = layers.selectAll('.layer')
                            .data(function () {
                                var data;

                                //If there is an active layer, we need to remove it from the regular layer stack
                                if (scope.layers !== undefined && scope.activeLayerId !== undefined) {
                                    data = scope.layers.slice(0);
                                    data.splice(scope.activeLayerId, 1);
                                }
                                else if (scope.layers)
                                    data = scope.layers;
                                else
                                    data = [];

                                return data;
                            }, function (d) {
                                return d.id;
                            });

                        layer
                            .enter()
                            .append('g')
                            .attr('class', 'layer');

                        layer
                            .transition()
                            .duration(function (d) {
                                return d.visible === false ? 170 : 0;
                            })
                            .style('opacity', function (d) {
                                return d.visible === false ? 0 : 1;
                            });

                        layer.selectAll('rect')
                            .data(function (layer) {
                                return layer.data;
                            })
                            .enter()
                            .append('rect');

                        layer.selectAll('rect')
                            .transition()
                            .attr("class", function (brushWrapper) {
                                return brushWrapper.preferred ? 'brush-passive preferred' : 'brush-passive';
                            })
                            .attr('rx', radius)
                            .attr('ry', radius)
                            .attr('x', function (brushWrapper) {
                                var xPos;
                                if (brushWrapper.brush && Object.prototype.toString.call(brushWrapper.brush) == '[object Function]')
                                    xPos = x(brushWrapper.brush.extent()[0]);
                                else
                                    xPos = x(brushWrapper.brush[0]);

                                return xPos;
                            })
                            .attr('width', function (brushWrapper) {
                                var width;
                                if (brushWrapper.brush && Object.prototype.toString.call(brushWrapper.brush) == '[object Function]')
                                    width = x(brushWrapper.brush.extent()[1]) - x(brushWrapper.brush.extent()[0]);
                                else
                                    width = x(brushWrapper.brush[1]) - x(brushWrapper.brush[0]);

                                return width;
                            })
							.attr("height", function(d){
								return d.preferred ? height : height*heightFactor;
							})
							.style("fill-opacity", function(d){
                                if(scope.activeLayerId !== undefined)
                                    return 1/(layer.data().length+1);
                                else
    								return 1/layer.data().length;
							});

                        layer.exit()
                            .remove();

                        //layers imported
                        if(scope.importedLayer !== undefined){

                            var layerImported = layersImported.selectAll('.layer-imported')
                                .data(scope.importedLayer, function (d){return d.id;});

                                layerImported
                                    .enter()
                                    .append('g')
                                    .attr('class', 'layer-imported')
                                    .attr('id', function (d){ return d.id;})
                                    .style('color', function (d){ return d.color;});

                                var importedBrushes = layerImported.selectAll('rect')
                                    .data(function(d){return d.data;});

                                importedBrushes
                                    .enter()
                                    .append('rect')
                                        .attr('rx', radius)
                                        .attr('ry', radius)
                                        .attr('x', function (brush) {
                                            return x(brush[0]);
                                        })
                                        .attr('width', function (brush) {
                                            var width;
                                                width = x(brush[1]) - x(brush[0]);

                                            return width;
                                        })
                                        .attr("height", function(d){
                                            return height;
                                        })
                                        .style('fill', 'currentColor')
                                        .style("fill-opacity", function(d){
                                            return 1;
                                        });

                                layerImported
                                    .exit()
                                    .remove();

                        }
                        else {
                            layersImported.selectAll('.layer-imported').remove();
                        }

                        //If we are editing a layer (activeLayerId is not undefined) then we need to add the brushes from those layers
                        if (scope.layers !== undefined && scope.activeLayerId !== undefined && scope.layers[scope.activeLayerId] !== undefined) {
                            var active_brushWrappers = scope.layers[scope.activeLayerId].data;

                            //add a new brush if the top brush is not empty, or there is no brush at all
                            if (active_brushWrappers.length > 0) {
                                var lastBrush = active_brushWrappers[0];
                                var lastBrushExtent = helpers.getExtent(lastBrush.brush);
                                if (lastBrushExtent[0].getTime() !== lastBrushExtent[1].getTime()) {
                                    newBrush();
                                }
                            }
                            else {
                                newBrush();
                            }

                            //render active brushes
                            var gBrush = brushContainer.selectAll('.brush')
                                .data(active_brushWrappers, function (d) {
                                    return d.id;
                                });

                            gBrush.enter()
                                .insert("g", '.brush')
                                .on('click', function () {
                                    d3.event.stopPropagation();
                                });

                            gBrush
                                .attr("class", function (brushWrapper) {
                                    return brushWrapper.preferred ? 'brush preferred' : 'brush';
                                })
                                .each(function (brushWrapper, i) {

                                    var domEl = d3.select(this);

                                    if (brushWrapper.brush && Object.prototype.toString.call(brushWrapper.brush) == '[object Function]')
                                        brushWrapper.brush(domEl);
                                    else {
                                        var b = newBrush(brushWrapper);
                                        b(d3.select(this));
                                    }

                                    domEl
                                        .selectAll('.background')
                                        .style('pointer-events', function () {
                                            return i === 0 && brushWrapper.brush !== undefined && brushWrapper.brush.extent()[0].getTime() == brushWrapper.brush.extent()[1].getTime() ? 'all' : 'none';
                                        });

                                });

                            gBrush.selectAll('.extent')
                                .attr('rx', radius)
                                .attr('ry', radius);

                            gBrush.selectAll('.resize').selectAll('rect')
                                .attr('rx', radius)
                                .attr('ry', radius);

                            gBrush.selectAll('rect')
                                .attr("height", height);

							gBrush.selectAll('.extent')
                                .attr("height", function(d){
									return d.preferred ? height : height*heightFactor;
								});
									
                            gBrush.exit()
                                .remove();

                        } else {
                            brushContainer.selectAll('.brush')
                                .data([])
                                .exit()
                                .remove();
                        }
                    }
                };

                //Watch for when users interact with data & browser
                scope.$watch('preferred', changeLastPreference);
                scope.$watch('layers', update);
                scope.$watch('activeLayerId', update);
                scope.$watch('width', update);
                scope.$on('calendarsImported.change', update);

				scope.$on('highlightUserBlocks', function (event, data){
					layer
						.classed('brush-active', function(d){
							return d.id === data.id ? data.highlight : false;
						});
				});

            }); //end promises
        } //end link function
    };
};

