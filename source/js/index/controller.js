/**
 *
 * Created by Jonathan on 2/8/2015.
 */
'use strict';

module.exports = function ($scope, eventsService){
    $scope.submitData = function (event)
    {
        var p = eventsService.createEvent(event);
        p.then(function(d){console.log(d)})
    };

    $scope.dates = [];
    $scope.logInfos = function (event, date){
        event.preventDefault(); // prevent the select to happen

        if(!date.selected)
            $scope.dates.push(date.toDate());
        else {
            var index= $scope.dates.indexOf(date.toDate());
            $scope.dates.splice(index, 1);
        }

        //reproduce the standard behavior
        date.selected = !date.selected;
    };

    //scheduler
    $scope.width = window.innerWidth-30;
    $scope.height = 50;

    var update = function (){
        $scope.width = window.innerWidth-30;
    };

    $scope.$on('resize', update);

};
