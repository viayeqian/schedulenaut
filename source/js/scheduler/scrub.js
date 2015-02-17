/**
 * Created by Jonathan on 1/25/2015.
 */

'use strict';

module.exports = function (helpers, d3Provider, momentProvider, $q) {
    return {
        restrict: 'A',
        scope: {
            height: '@',
            width: '@',
            granularity: '=',
            scrub: '='
        },
        link: function (scope, element, attrs) {

            var promises = [d3Provider.d3(), momentProvider.moment()];
            $q.all(promises).then(function (promise) {
                var d3 = promise[0];
                var moment = promise[1];

                scope.el = d3.select(element[0]);

                var brushes = [];

                var newBrush = function (container) {
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
                        //brush.extent.start is a property created that holds the original extent of the bar when brush start
                        if (brush.extent.start) {
                            //time where we can not go pass as to not overlap
                            var edge = [];

                            //go through each event blocks and look for the 2 closest one on both side to the current one and store that to edge
                            for (var i = 0; i < brushes.length; i++) {
                                var otherBrush = brushes[i];

                                if (otherBrush !== brush) {
                                    if (otherBrush.extent()[1].getTime() <= brush.extent.start[0].getTime()) {
                                        if (edge[0] !== undefined && otherBrush.extent()[1].getTime() > edge[0].getTime() || edge[0] === undefined)
                                            edge[0] = otherBrush.extent()[1];
                                    }
                                    else if (otherBrush.extent()[0].getTime() > brush.extent.start[0].getTime()) {
                                        if (edge[1] !== undefined && otherBrush.extent()[0].getTime() < edge[1].getTime() || edge[1] === undefined)
                                            edge[1] = otherBrush.extent()[0];
                                    }
                                }
                            }

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
                        }

                        d3.select(this).call(brush.extent(extent1));
                    };

                    var brushend = function () {


                        gBrush.select('.background')
                            .style('pointer-events', 'none');

                        //When we finish brushing, the extent will be the starting extent for next time
                        //This is useful for determining what is surrounding the current block later
                        brush.extent.start = brush.extent();

                        //Figure out whether we need to add a new brush or not.
                        //If last brush has been modified, then it's been used and we need to add a new brush.
                        //Else it's still empty, and we don't need to do anything.
                        var lastBrushExtent = brushes[brushes.length - 1].extent();
                        if (lastBrushExtent[0].getTime() !== lastBrushExtent[1].getTime())
                            newBrush(container);
                    };

                    var brush = d3.svg.brush()
                        .x(x)
                        .on("brush", brushed)
                        .on("brushend", brushend);

                    brushes.push(brush);

                    var gBrush = container.insert("g", '.brush')
                        .attr("class", "brush")
                        .on("click", function () {
                            d3.event.stopPropagation();
                        })
                        .call(brush);

                    gBrush.selectAll("rect")
                        .attr("height", height);


                    return brush;
                };

                var margin = {top: 10, right: 10, bottom: 20, left: 10},
                    width = parseInt(scope.width) - margin.left - margin.right,
                    height = parseInt(scope.height) - margin.top - margin.bottom;

                var endDate = new Date(scope.scrub.getTime());
                endDate.setHours(endDate.getHours() + 23);

                var x = d3.time.scale()
                    .domain([scope.scrub, endDate])
                    .range([0, width]);

                var header = scope.el.append('h3')
                    .html(function () {
                        return moment(scope.scrub).format('MMMM Do');
                    });

                var svg = scope.el.append("svg")
                    .attr("width", width + margin.left + margin.right)
                    .attr("height", height + margin.top + margin.bottom)
                    .append("g")
                    .attr("transform", "translate(" + margin.left + "," + margin.top + ")");

                svg.append("rect")
                    .attr("class", "grid-background")
                    .attr("width", width)
                    .attr("height", height);

                svg.append("g")
                    .attr("class", "x grid")
                    .attr("transform", "translate(0," + height + ")")
                    .call(d3.svg.axis()
                        .scale(x)
                        .orient("bottom")
                        .ticks(d3.time.minute, 30)
                        .tickSize(-height)
                        .tickFormat(""))
                    .selectAll(".tick")
                    .classed("minor", function (d) {
                        return d.getHours();
                    });

                svg.append("g")
                    .attr("class", "x axis")
                    .attr("transform", "translate(0," + height + ")")
                    .call(d3.svg.axis()
                        .scale(x)
                        .orient("bottom")
                        .tickPadding(0))
                    .selectAll("text")
                    .attr("x", 6)
                    .style("text-anchor", null);

                var brushesContainer = svg.append('g')
                    .attr('class', 'brushes');

                newBrush(brushesContainer);

            }); //end promises
        } //end link function
    };
};

