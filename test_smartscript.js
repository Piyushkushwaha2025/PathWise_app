
        (function() {
          try {
            var c = document.cookie;
            window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'COOKIES', data: c }));
          } catch(e){}

          try {
            Array.from(document.querySelectorAll('a')).forEach(function(a) {
              var h = (a.href || '').toLowerCase();
              var txt = (a.innerText || '').toLowerCase();
              if (h && !h.startsWith('javascript:')) {
                if (h.includes('timetable') || txt.includes('time table') || txt.includes('timetable') || h.includes('schedule')) {
                  window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'DYNAMIC_URL', step: 'timetable', url: a.href }));
                }
                if (h.includes('attendancesummary') || txt.includes('attendance')) {
                  window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'DYNAMIC_URL', step: 'attendance', url: a.href }));
                }
                if (h.includes('marks') || txt.includes('marks') || txt.includes('result') || txt.includes('grade')) {
                  window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'DYNAMIC_URL', step: 'marks', url: a.href }));
                }
              }
            });
          } catch(e){}

          try {
            var currentUrl = window.location.href.toLowerCase();
            var expectedKeyword = 'testKeyword';
            var stepId = 'testStepId';
            
            var isCorrectPage = currentUrl.includes(expectedKeyword) && !expectedKeyword.startsWith('javascript:');
            
            // Handle AJAX postbacks and javascript: URLs where URL doesn't change
            if (!isCorrectPage) {
               var pageText = document.body.innerText.toLowerCase();
               var hasTable = document.querySelector('table') !== null;
               
               if (stepId === 'timetable' && hasTable && (pageText.includes('time table') || pageText.includes('timetable') || pageText.includes('schedule'))) isCorrectPage = true;
               if (stepId === 'attendance' && hasTable && (pageText.includes('attendance') || pageText.includes('total classes'))) isCorrectPage = true;
               if (stepId === 'marks' && hasTable && (pageText.includes('result') || pageText.includes('grade') || pageText.includes('marks'))) isCorrectPage = true;
               
               // Dashboard is always correct if no other specific keyword matches and URL is dashboard
               if (stepId === 'dashboard' && currentUrl.includes('dashboard')) isCorrectPage = true;
            }

            if (isCorrectPage) {
              // Correct page — run the scrape script
              try { ${s.script} } catch(e) {
                console.log('[SYNC] Script error:', e.message);
              }
            } else {
              // Wrong page — throttle navigation so we don't interrupt loading
              var now = Date.now();
              var lastNav = Number(sessionStorage.getItem('last_nav_time') || 0);
              var lastTarget = sessionStorage.getItem('last_nav_target') || '';
              var targetUrl = 'http://test';
              
              if (lastTarget !== targetUrl || now - lastNav > 8000) {
                sessionStorage.setItem('last_nav_time', now);
                sessionStorage.setItem('last_nav_target', targetUrl);
                
                // ASP.NET Safe Navigation: Try to click the actual link in the DOM first
                var keywordToMatch = stepId === 'timetable' ? 'timetable' : stepId === 'attendance' ? 'attendance' : stepId === 'marks' ? 'marks' : expectedKeyword.replace('frm', '').replace('.aspx', '').replace('student', '');
                var linkToClick = Array.from(document.querySelectorAll('a')).find(function(a) {
                   var h = (a.href || '').toLowerCase();
                   var txt = (a.innerText || '').toLowerCase().replace(/\\s+/g, '');
                   var oc = (a.getAttribute('onclick') || '').toLowerCase();
                   return h.includes(expectedKeyword) || txt.includes(keywordToMatch) || oc.includes(keywordToMatch);
                });
                
                if (linkToClick) {
                   linkToClick.click();
                } else {
                   window.location.href = targetUrl;
                }
              }
            }
          } catch(e){}
        })();
        true;
      